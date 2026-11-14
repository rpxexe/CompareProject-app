import React, { useEffect, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, View } from "react-native";
import { isReducedMotion } from "../hooks/useReducedMotion";
import Svg, { Line, Path } from "react-native-svg";
import { brand } from "../theme";
import Text from "./AppText";

const TOP_RADIUS = 4;

// Bar with only its top corners rounded, so it sits flat on the baseline.
function barPath(x, y, w, h) {
  const r = Math.min(TOP_RADIUS, w / 2, h);
  return `M${x},${y + h} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + w - r},${y} Q${x + w},${y} ${x + w},${y + r} L${x + w},${y + h} Z`;
}

// Single-series bar chart for small cards. One hue; the card title names the series, so there
// is no legend. Tapping a bar selects it and the readout shows its exact value. Screen readers
// get every value in the accessibility label.
// `play` (optional): false holds the bars at the baseline, true grows them up one after another.
// Leave it out for a static chart.
export default function MiniBarChart({ data, height = 96, color = brand.violet, formatValue = String, unit = "", play }) {
  const grow = useRef(data.map(() => new Animated.Value(play === false && !isReducedMotion() ? 0 : 1))).current;
  useEffect(() => {
    if (!play || isReducedMotion()) return;
    Animated.stagger(
      110,
      grow.map((v) => Animated.spring(v, { toValue: 1, stiffness: 160, damping: 14, mass: 0.9, useNativeDriver: true })),
    ).start();
  }, [play]); // eslint-disable-line react-hooks/exhaustive-deps
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState(() => maxIndex(data));
  const max = Math.max(...data.map((d) => d.value), 1);
  const gap = 2;
  const slot = data.length ? width / data.length : 0;
  const barW = Math.max(6, Math.min(22, slot * 0.5));
  const sel = data[selected] || data[0];

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={data.map((d) => `${d.label}: ${formatValue(d.value)}${unit}`).join(", ")}
    >
      <Text style={styles.readout} numberOfLines={1}>
        <Text style={styles.readoutValue}>{sel ? formatValue(sel.value) : ""}</Text>
        <Text style={styles.readoutLabel}>{sel ? `  ${sel.label}${unit}` : ""}</Text>
      </Text>
      <View style={{ height }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {width > 0 ? (
          <Svg width={width} height={height}>
            {[0.5, 1].map((f) => (
              <Line key={f} x1={0} x2={width} y1={height - height * f + 1} y2={height - height * f + 1} stroke="#EEF1F2" strokeWidth={1} />
            ))}
            <Line x1={0} x2={width} y1={height - 0.5} y2={height - 0.5} stroke="#DEE3E5" strokeWidth={1} />
          </Svg>
        ) : null}
        {/* Bars as their own views so each can grow up from the baseline. */}
        {width > 0
          ? data.map((d, i) => {
              const h = Math.max(2, (d.value / max) * (height - 6));
              const x = i * slot + (slot - barW) / 2 + gap / 2;
              const w = barW - gap;
              return (
                <Animated.View
                  key={d.label}
                  pointerEvents="none"
                  style={[styles.bar, { left: x, top: height - h, width: w, height: h, opacity: i === selected ? 1 : 0.45 }, grow[i] && { transform: [{ scaleY: grow[i] }] }]}
                >
                  <Svg width={w} height={h}>
                    <Path d={barPath(0, 0, w, h)} fill={color} />
                  </Svg>
                </Animated.View>
              );
            })
          : null}
        {/* Hit targets wider than the bars. */}
        <View style={StyleSheet.absoluteFill}>
          <View style={styles.hitRow}>
            {data.map((d, i) => (
              <Pressable key={d.label} style={styles.hit} onPress={() => setSelected(i)} accessibilityElementsHidden importantForAccessibility="no" />
            ))}
          </View>
        </View>
      </View>
      <View style={styles.axis}>
        {data.map((d) => (
          <Text key={d.label} style={styles.axisLabel} numberOfLines={1}>
            {d.short || d.label}
          </Text>
        ))}
      </View>
    </View>
  );
}

function maxIndex(data) {
  let best = 0;
  data.forEach((d, i) => {
    if (d.value > (data[best]?.value ?? -1)) best = i;
  });
  return best;
}

const styles = StyleSheet.create({
  readout: { marginBottom: 8 },
  readoutValue: { fontSize: 15, fontWeight: "800", color: brand.ink },
  readoutLabel: { fontSize: 11.5, color: brand.inkSoft, fontWeight: "600" },
  bar: { position: "absolute", transformOrigin: "bottom" },
  hitRow: { flex: 1, flexDirection: "row" },
  hit: { flex: 1 },
  axis: { flexDirection: "row", marginTop: 6 },
  axisLabel: { flex: 1, textAlign: "center", fontSize: 10.5, color: brand.inkSoft, fontWeight: "600" },
});
