import { useDashboard } from "components/Dashboard/DashboardProvider";
import { useFeatureVisibility } from "hooks/useFeatureVisibility";
import { FC, useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useNavigate } from "react-router-dom";
import { Workspace } from "./Workspace";
import { pageTitle } from "utils/page";
import { hasJobError } from "utils/workspace";
import { UpdateBuildParametersDialog } from "./UpdateBuildParametersDialog";
import { ChangeVersionDialog } from "./ChangeVersionDialog";
import { useMutation, useQuery, useQueryClient } from "react-query";
import { MissingBuildParameters, restartWorkspace } from "api/api";
import {
  ConfirmDialog,
  ConfirmDialogProps,
} from "components/Dialogs/ConfirmDialog/ConfirmDialog";
import * as TypesGen from "api/typesGenerated";
import { WorkspaceBuildLogsSection } from "./WorkspaceBuildLogsSection";
import { templateVersion, templateVersions } from "api/queries/templates";
import { Alert } from "components/Alert/Alert";
import { Stack } from "components/Stack/Stack";
import { useWorkspaceBuildLogs } from "hooks/useWorkspaceBuildLogs";
import {
  activate,
  changeVersion,
  deleteWorkspace,
  updateWorkspace,
  stopWorkspace,
  startWorkspace,
  cancelBuild,
} from "api/queries/workspaces";
import { getErrorMessage } from "api/errors";
import { displayError } from "components/GlobalSnackbar/utils";
import { deploymentConfig, deploymentSSHConfig } from "api/queries/deployment";
import { WorkspacePermissions } from "./permissions";
import { workspaceResolveAutostart } from "api/queries/workspaceQuota";
import { WorkspaceDeleteDialog } from "./WorkspaceDeleteDialog";
import dayjs from "dayjs";

interface WorkspaceReadyPageProps {
  template: TypesGen.Template;
  workspace: TypesGen.Workspace;
  permissions: WorkspacePermissions;
  builds: TypesGen.WorkspaceBuild[] | undefined;
  buildsError: unknown;
  onLoadMoreBuilds: () => void;
  isLoadingMoreBuilds: boolean;
  hasMoreBuilds: boolean;
}

export const WorkspaceReadyPage = ({
  workspace,
  template,
  permissions,
  builds,
  buildsError,
  onLoadMoreBuilds,
  isLoadingMoreBuilds,
  hasMoreBuilds,
}: WorkspaceReadyPageProps): JSX.Element => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { buildInfo } = useDashboard();
  const featureVisibility = useFeatureVisibility();
  if (workspace === undefined) {
    throw Error("Workspace is undefined");
  }

  // Debug mode
  const { data: deploymentValues } = useQuery({
    ...deploymentConfig(),
    enabled: permissions?.viewDeploymentValues,
  });

  // Build logs
  const buildLogs = useWorkspaceBuildLogs(workspace.latest_build.id);
  const shouldDisplayBuildLogs =
    hasJobError(workspace) ||
    ["canceling", "deleting", "pending", "starting", "stopping"].includes(
      workspace.latest_build.status,
    );

  // Restart
  const [confirmingRestart, setConfirmingRestart] = useState<{
    open: boolean;
    buildParameters?: TypesGen.WorkspaceBuildParameter[];
  }>({ open: false });
  const {
    mutate: mutateRestartWorkspace,
    error: restartBuildError,
    isLoading: isRestarting,
  } = useMutation({
    mutationFn: restartWorkspace,
  });

  // Auto start
  const canAutostartResponse = useQuery(
    workspaceResolveAutostart(workspace.id),
  );
  const canAutostart = !canAutostartResponse.data?.parameter_mismatch ?? false;

  // SSH Prefix
  const sshPrefixQuery = useQuery(deploymentSSHConfig());

  // Favicon
  const favicon = getFaviconByStatus(workspace.latest_build);
  const [faviconTheme, setFaviconTheme] = useState<"light" | "dark">("dark");
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) {
      return;
    }

    const isDark = window.matchMedia("(prefers-color-scheme: dark)");
    // We want the favicon the opposite of the theme.
    setFaviconTheme(isDark.matches ? "light" : "dark");
  }, []);

  // Change version
  const canChangeVersions = Boolean(permissions?.updateTemplate);
  const [changeVersionDialogOpen, setChangeVersionDialogOpen] = useState(false);
  const changeVersionMutation = useMutation(
    changeVersion(workspace, queryClient),
  );

  // Versions
  const { data: allVersions } = useQuery({
    ...templateVersions(workspace.template_id),
    enabled: changeVersionDialogOpen,
  });
  const { data: latestVersion } = useQuery({
    ...templateVersion(workspace.template_active_version_id),
    enabled: workspace.outdated,
  });

  // Update workspace
  const canUpdateWorkspace = Boolean(permissions?.updateWorkspace);
  const [isConfirmingUpdate, setIsConfirmingUpdate] = useState(false);
  const updateWorkspaceMutation = useMutation(
    updateWorkspace(workspace, queryClient),
  );

  // If a user can update the template then they can force a delete
  // (via orphan).
  const canUpdateTemplate = Boolean(permissions?.updateTemplate);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const deleteWorkspaceMutation = useMutation(
    deleteWorkspace(workspace, queryClient),
  );

  // Activate workspace
  const activateWorkspaceMutation = useMutation(
    activate(workspace, queryClient),
  );

  // Stop workspace
  const stopWorkspaceMutation = useMutation(
    stopWorkspace(workspace, queryClient),
  );

  // Start workspace
  const startWorkspaceMutation = useMutation(
    startWorkspace(workspace, queryClient),
  );

  // Cancel build
  const cancelBuildMutation = useMutation(cancelBuild(workspace, queryClient));

  const handleBuildRetry = (debug = false) => {
    const logLevel = debug ? "debug" : undefined;

    switch (workspace.latest_build.transition) {
      case "start":
        startWorkspaceMutation.mutate({ logLevel });
        break;
      case "stop":
        stopWorkspaceMutation.mutate({ logLevel });
        break;
      case "delete":
        deleteWorkspaceMutation.mutate({ logLevel });
        break;
    }
  };

  return (
    <>
      <Helmet>
        <title>{pageTitle(`${workspace.owner_name}/${workspace.name}`)}</title>
        <link
          rel="alternate icon"
          type="image/png"
          href={`/favicons/${favicon}-${faviconTheme}.png`}
        />
        <link
          rel="icon"
          type="image/svg+xml"
          href={`/favicons/${favicon}-${faviconTheme}.svg`}
        />
      </Helmet>

      <Workspace
        isUpdating={updateWorkspaceMutation.isLoading}
        isRestarting={isRestarting}
        workspace={workspace}
        handleStart={(buildParameters) => {
          startWorkspaceMutation.mutate({ buildParameters });
        }}
        handleStop={() => {
          stopWorkspaceMutation.mutate({});
        }}
        handleDelete={() => {
          setIsConfirmingDelete(true);
        }}
        handleRestart={(buildParameters) => {
          setConfirmingRestart({ open: true, buildParameters });
        }}
        handleUpdate={() => {
          setIsConfirmingUpdate(true);
        }}
        handleCancel={cancelBuildMutation.mutate}
        handleSettings={() => navigate("settings")}
        handleBuildRetry={() => handleBuildRetry(false)}
        handleBuildRetryDebug={() => handleBuildRetry(true)}
        canRetryDebugMode={
          deploymentValues?.config.enable_terraform_debug_mode ?? false
        }
        handleChangeVersion={() => {
          setChangeVersionDialogOpen(true);
        }}
        handleDormantActivate={async () => {
          try {
            await activateWorkspaceMutation.mutateAsync();
          } catch (e) {
            const message = getErrorMessage(e, "Error activate workspace.");
            displayError(message);
          }
        }}
        resources={workspace.latest_build.resources}
        builds={builds}
        onLoadMoreBuilds={onLoadMoreBuilds}
        isLoadingMoreBuilds={isLoadingMoreBuilds}
        hasMoreBuilds={hasMoreBuilds}
        canUpdateWorkspace={canUpdateWorkspace}
        updateMessage={latestVersion?.message}
        canChangeVersions={canChangeVersions}
        hideSSHButton={featureVisibility["browser_only"]}
        hideVSCodeDesktopButton={featureVisibility["browser_only"]}
        workspaceErrors={{
          getBuildsError: buildsError,
          buildError:
            restartBuildError ??
            startWorkspaceMutation.error ??
            stopWorkspaceMutation.error ??
            deleteWorkspaceMutation.error ??
            updateWorkspaceMutation.error,
          cancellationError: cancelBuildMutation.error,
        }}
        buildInfo={buildInfo}
        sshPrefix={sshPrefixQuery.data?.hostname_prefix}
        template={template}
        buildLogs={
          shouldDisplayBuildLogs && (
            <WorkspaceBuildLogsSection logs={buildLogs} />
          )
        }
        canAutostart={canAutostart}
      />

      <WorkspaceDeleteDialog
        workspace={workspace}
        canUpdateTemplate={canUpdateTemplate}
        isOpen={isConfirmingDelete}
        onCancel={() => {
          setIsConfirmingDelete(false);
        }}
        onConfirm={(orphan) => {
          deleteWorkspaceMutation.mutate({ orphan });
          setIsConfirmingDelete(false);
        }}
        workspaceBuildDateStr={dayjs(workspace.created_at).fromNow()}
      />

      <UpdateBuildParametersDialog
        missedParameters={
          changeVersionMutation.error instanceof MissingBuildParameters
            ? changeVersionMutation.error.parameters
            : []
        }
        open={changeVersionMutation.error instanceof MissingBuildParameters}
        onClose={() => {
          changeVersionMutation.reset();
        }}
        onUpdate={(buildParameters) => {
          if (changeVersionMutation.error instanceof MissingBuildParameters) {
            changeVersionMutation.mutate({
              versionId: changeVersionMutation.error.versionId,
              buildParameters,
            });
          }
        }}
      />

      <UpdateBuildParametersDialog
        missedParameters={
          updateWorkspaceMutation.error instanceof MissingBuildParameters
            ? updateWorkspaceMutation.error.parameters
            : []
        }
        open={updateWorkspaceMutation.error instanceof MissingBuildParameters}
        onClose={() => {
          updateWorkspaceMutation.reset();
        }}
        onUpdate={(buildParameters) => {
          if (updateWorkspaceMutation.error instanceof MissingBuildParameters) {
            updateWorkspaceMutation.mutate(buildParameters);
          }
        }}
      />

      <ChangeVersionDialog
        templateVersions={allVersions?.reverse()}
        template={template}
        defaultTemplateVersion={allVersions?.find(
          (v) => workspace.latest_build.template_version_id === v.id,
        )}
        open={changeVersionDialogOpen}
        onClose={() => {
          setChangeVersionDialogOpen(false);
        }}
        onConfirm={(templateVersion) => {
          setChangeVersionDialogOpen(false);
          changeVersionMutation.mutate({ versionId: templateVersion.id });
        }}
      />

      <WarningDialog
        open={isConfirmingUpdate}
        onConfirm={() => {
          updateWorkspaceMutation.mutate(undefined);
          setIsConfirmingUpdate(false);
        }}
        onClose={() => setIsConfirmingUpdate(false)}
        title="Update and restart?"
        confirmText="Update"
        description={
          <Stack>
            <p>
              Restarting your workspace will stop all running processes and{" "}
              <strong>delete non-persistent data</strong>.
            </p>
            {latestVersion?.message && (
              <Alert severity="info">{latestVersion.message}</Alert>
            )}
          </Stack>
        }
      />

      <WarningDialog
        open={confirmingRestart.open}
        onConfirm={() => {
          mutateRestartWorkspace({
            workspace,
            buildParameters: confirmingRestart.buildParameters,
          });
          setConfirmingRestart({ open: false });
        }}
        onClose={() => setConfirmingRestart({ open: false })}
        title="Restart your workspace?"
        confirmText="Restart"
        description={
          <>
            Restarting your workspace will stop all running processes and{" "}
            <strong>delete non-persistent data</strong>.
          </>
        }
      />
    </>
  );
};

const WarningDialog: FC<
  Pick<
    ConfirmDialogProps,
    "open" | "onClose" | "title" | "confirmText" | "description" | "onConfirm"
  >
> = (props) => {
  return <ConfirmDialog type="info" hideCancel={false} {...props} />;
};

// You can see the favicon designs here: https://www.figma.com/file/YIGBkXUcnRGz2ZKNmLaJQf/Coder-v2-Design?node-id=560%3A620
type FaviconType =
  | "favicon"
  | "favicon-success"
  | "favicon-error"
  | "favicon-warning"
  | "favicon-running";

const getFaviconByStatus = (build: TypesGen.WorkspaceBuild): FaviconType => {
  switch (build.status) {
    case undefined:
      return "favicon";
    case "running":
      return "favicon-success";
    case "starting":
      return "favicon-running";
    case "stopping":
      return "favicon-running";
    case "stopped":
      return "favicon";
    case "deleting":
      return "favicon";
    case "deleted":
      return "favicon";
    case "canceling":
      return "favicon-warning";
    case "canceled":
      return "favicon";
    case "failed":
      return "favicon-error";
    case "pending":
      return "favicon";
  }
};
