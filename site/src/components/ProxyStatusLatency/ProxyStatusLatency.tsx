import HelpOutline from "@mui/icons-material/HelpOutline";
import Tooltip from "@mui/material/Tooltip";
import CircularProgress from "@mui/material/CircularProgress";
import { useTheme } from "@emotion/react";
import { type FC } from "react";
import { getLatencyColor } from "utils/latency";

interface ProxyStatusLatencyProps {
  latency?: number;
  isLoading?: boolean;
}

export const ProxyStatusLatency: FC<ProxyStatusLatencyProps> = ({
  latency,
  isLoading,
}) => {
  const theme = useTheme();
  // Always use the no latency color for loading.
  const color = getLatencyColor(theme, isLoading ? undefined : latency);

  if (isLoading) {
    return (
      <Tooltip title="Loading latency...">
        <CircularProgress
          size={14}
          css={{ marginLeft: "auto" }}
          style={{ color }}
        />
      </Tooltip>
    );
  }

  if (!latency) {
    return (
      <Tooltip title="Latency not available">
        <HelpOutline
          css={{ marginLeft: "auto", fontSize: "14px !important" }}
          style={{ color }}
        />
      </Tooltip>
    );
  }

  return (
    <div css={{ fontSize: 13, marginLeft: "auto" }} style={{ color }}>
      {latency.toFixed(0)}ms
    </div>
  );
};
