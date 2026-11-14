import React from "react";
import Text from "./AppText";

// "Starting from ₹1.38 Cr* onwards": how sale prices read on cards and the details screen. The
// price is the lowest among the project's units (the asterisk marks it as a starting price).
// `labelStyle` styles the words, `priceStyle` the amount; both nest inside `style`.
export default function PriceFrom({ value, style, labelStyle, priceStyle, numberOfLines = 1, ...rest }) {
  if (!value) return null;
  return (
    <Text style={style} numberOfLines={numberOfLines} accessibilityLabel={`Starting from ${value} onwards`} {...rest}>
      <Text style={labelStyle}>Starting from </Text>
      <Text style={priceStyle}>{`${value}*`}</Text>
      <Text style={labelStyle}> onwards</Text>
    </Text>
  );
}
