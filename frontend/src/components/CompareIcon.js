import React from "react";
import Svg, { Path } from "react-native-svg";

// The app's compare symbol, a chemical-equilibrium arrow (⇌): two half-headed arrows pointing
// opposite ways. Used by the bottom nav's Compare tab and anywhere else "compare" needs an icon.
export default function CompareIcon({ size = 22, color, bold }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 9H20L15 4M20 15H4L9 20"
        stroke={color}
        strokeWidth={bold ? 2.4 : 2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
