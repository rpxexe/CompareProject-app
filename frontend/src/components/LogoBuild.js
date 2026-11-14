import React, { useCallback, useEffect, useRef, useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  Extrapolation,
  FadeInDown,
  cancelAnimation,
  interpolate,
  runOnJS,
  useAnimatedProps,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import Svg, { ClipPath, Defs, G, LinearGradient, Path, Rect, Stop } from "react-native-svg";
import { brand } from "../theme";
import Text from "./AppText";
import { LOGO_C, LOGO_P, LOGO_TOWER } from "./logoPaths";

// The CP monogram parts are exact outlines traced from the logo artwork (logoPaths.js), in its
// 1254-unit space. The C and P are "painted" by a wide brush running along each letter's
// centreline and clipped to the letter's true outline, so the reveal follows the stroke while the
// shape stays exact. The brush runs a little past both ends so the tips are fully covered.
const C_BRUSH = { d: "M 566 716 L 550 720 C 430 720 328 599 328 450 C 328 301 441 180 580 180 C 660 180 740 190 800 210 L 850 228", len: 1092 };
const P_BRUSH = { d: "M 690 428 L 800 428 C 884 428 952 493 952 573 C 952 654 884 719 800 719 L 690 719", len: 692 };
// Finished logo: the original glossy artwork recoloured to brand blue, cropped to the same window.
const GLOSS = require("../../assets/logo_mark_build.png");
const GROUND = { d: "M 470 890 H 770", len: 300 };
const POLES = [
  { d: "M 526 890 V 262", len: 628 },
  { d: "M 708 890 V 262", len: 628 },
];
const FLOOR_LINES = Array.from({ length: 13 }, (_, i) => `M 540 ${840 - i * 44} H 694`).join(" ");

// Square window onto the artwork around the mark.
const VB_X = 252;
const VB_Y = 142;
const VB = 780;
const VIEWBOX = `${VB_X} ${VB_Y} ${VB} ${VB}`;
const BASE = 890; // ground line (the tower's foot is at 886)
const TOP = 262; // just above the tower's tip
const FLOORS = 12;

export const BUILD_DURATION = 2900;

// Timeline, as fractions of BUILD_DURATION.
const T = {
  ground: [0.0, 0.12],
  poles: [0.04, 0.18],
  craneIn: [0.05, 0.13],
  build: [0.12, 0.56],
  siteOut: [0.57, 0.68], // crane leaves, scaffolding + floor lines fade
  c: [0.58, 0.82],
  p: [0.64, 0.86],
  gloss: [0.84, 0.97], // vector shapes hand over to the glossy artwork
  pop: [0.84, 0.97],
  word: 0.8,
};

const ease = Easing.inOut(Easing.cubic);
const seg = (t, [a, b]) => {
  "worklet";
  return ease(interpolate(t, [a, b], [0, 1], Extrapolation.CLAMP));
};
const lin = (t, [a, b]) => {
  "worklet";
  return interpolate(t, [a, b], [0, 1], Extrapolation.CLAMP);
};

const AnimatedPath = Animated.createAnimatedComponent(Path);

function DrawPath({ d, len, progress, ...rest }) {
  const dash = `${len + 4} ${len + 4}`;
  const animatedProps = useAnimatedProps(() => ({ strokeDashoffset: (len + 4) * (1 - progress.value) }));
  return <AnimatedPath d={d} fill="none" strokeDasharray={dash} animatedProps={animatedProps} {...rest} />;
}

function BlueGradient({ id }) {
  return (
    <Defs>
      <LinearGradient id={id} x1="300" y1="180" x2="1000" y2="880" gradientUnits="userSpaceOnUse">
        <Stop offset="0" stopColor="#4F7DFF" />
        <Stop offset="0.55" stopColor={brand.violet} />
        <Stop offset="1" stopColor={brand.deep} />
      </LinearGradient>
    </Defs>
  );
}

// Tower crane drawn in its own 150×130 box; the mast's foot is at (118, 130).
export function Crane({ size }) {
  return (
    <Svg width={size} height={size * (130 / 150)} viewBox="0 0 150 130">
      <G stroke="#8EA6EE" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" fill="none">
        <Path d="M 112 130 V 22 M 124 130 V 22 M 112 112 L 124 96 M 112 86 L 124 70 M 112 60 L 124 44 M 112 34 L 124 22" />
        <Path d="M 8 20 H 146 M 8 20 L 118 6 L 146 20 M 118 6 V 20" />
        <Path d="M 44 20 V 64" strokeWidth={2} />
      </G>
      <Rect x={134} y={20} width={12} height={12} rx={2} fill="#8EA6EE" />
      <Rect x={108} y={18} width={20} height={14} rx={3} fill={brand.violet} />
      {/* A floor slab on the hook. */}
      <Rect x={30} y={64} width={28} height={7} rx={2} fill="#B9CAFF" />
    </Svg>
  );
}

// Light-background launch reveal: scaffolding goes up, the CP tower is built floor by floor while
// a crane climbs with it, then the C and P draw themselves in on either side, the glossy logo
// fades in over the vector build and the wordmark follows. Calls onRevealed once the logo has settled. Reduced motion shows the finished logo.
export default function LogoBuild({ size, reduced = false, onRevealed }) {
  const t = useSharedValue(reduced ? 1 : 0);
  const [showWord, setShowWord] = useState(reduced);
  const onRevealedRef = useRef(onRevealed);
  onRevealedRef.current = onRevealed;
  const notify = useCallback(() => onRevealedRef.current?.(), []);

  useEffect(() => {
    if (reduced) {
      cancelAnimation(t);
      t.value = 1;
      setShowWord(true);
      notify();
      return undefined;
    }
    t.value = withTiming(1, { duration: BUILD_DURATION, easing: Easing.linear }, (finished) => {
      if (finished) runOnJS(notify)();
    });
    // The wordmark mounts late on purpose: by then the app font has loaded.
    const id = setTimeout(() => setShowWord(true), BUILD_DURATION * T.word);
    return () => {
      cancelAnimation(t);
      clearTimeout(id);
    };
  }, [reduced, t, notify]);

  const k = size / VB;
  const y = (v) => (v - VB_Y) * k;
  const x = (v) => (v - VB_X) * k;
  const buildH = (BASE - TOP) * k;
  const belowBase = size - y(BASE);
  const craneW = 150 * k;
  const wordSize = Math.max(20, Math.round(size * 0.13));
  const wordLine = Math.round(wordSize * 1.4);

  const ground = useDerivedValue(() => seg(t.value, T.ground));
  const poles = useDerivedValue(() => seg(t.value, T.poles));
  const cDraw = useDerivedValue(() => seg(t.value, T.c));
  const pDraw = useDerivedValue(() => seg(t.value, T.p));
  // Height built so far: floor by floor, each floor easing into place.
  const built = useDerivedValue(() => {
    const q = lin(t.value, T.build) * FLOORS;
    const i = Math.floor(q);
    const f = q - i;
    return Math.min(1, (i + (1 - Math.pow(1 - f, 3))) / FLOORS);
  });

  const siteStyle = useAnimatedStyle(() => ({ opacity: 1 - seg(t.value, T.siteOut) }));
  const towerClip = useAnimatedStyle(() => ({ height: built.value * buildH }));
  const floorsStyle = useAnimatedStyle(() => ({ opacity: 1 - seg(t.value, T.siteOut) }));
  const craneStyle = useAnimatedStyle(() => {
    const out = seg(t.value, T.siteOut);
    return {
      opacity: seg(t.value, T.craneIn) * (1 - out),
      transform: [{ translateY: -built.value * buildH - out * 50 * k }],
    };
  });
  const cStyle = useAnimatedStyle(() => ({ transform: [{ translateX: -(1 - seg(t.value, T.c)) * 26 * k }] }));
  const pStyle = useAnimatedStyle(() => ({ transform: [{ translateX: (1 - seg(t.value, T.p)) * 26 * k }] }));
  const glossStyle = useAnimatedStyle(() => ({ opacity: seg(t.value, T.gloss) }));
  // A small settle once the whole mark is in.
  const markStyle = useAnimatedStyle(() => {
    const p = lin(t.value, T.pop);
    return { transform: [{ scale: 1 + Math.sin(p * Math.PI) * 0.04 }] };
  });

  const layer = { position: "absolute", left: 0, top: 0, width: size, height: size };

  return (
    <View style={{ alignItems: "center" }} pointerEvents="none">
      <Animated.View style={[{ width: size, height: size }, markStyle]}>
        {/* Building site: ground line and scaffolding poles. */}
        <Animated.View style={[layer, siteStyle]}>
          <Svg width={size} height={size} viewBox={VIEWBOX}>
            <DrawPath {...GROUND} progress={ground} stroke="#C5D4FF" strokeWidth={8} strokeLinecap="round" />
            {POLES.map((p) => (
              <DrawPath key={p.d} {...p} progress={poles} stroke="#D3DEFF" strokeWidth={6} strokeLinecap="round" />
            ))}
          </Svg>
        </Animated.View>

        <Animated.View style={[layer, cStyle]}>
          <Svg width={size} height={size} viewBox={VIEWBOX}>
            <BlueGradient id="cpC" />
            <Defs>
              <ClipPath id="cpCShape">
                <Path d={LOGO_C} />
              </ClipPath>
            </Defs>
            <G clipPath="url(#cpCShape)">
              <DrawPath {...C_BRUSH} progress={cDraw} stroke="url(#cpC)" strokeWidth={170} />
            </G>
          </Svg>
        </Animated.View>
        <Animated.View style={[layer, pStyle]}>
          <Svg width={size} height={size} viewBox={VIEWBOX}>
            <BlueGradient id="cpP" />
            <Defs>
              <ClipPath id="cpPShape">
                <Path d={LOGO_P} />
              </ClipPath>
            </Defs>
            <G clipPath="url(#cpPShape)">
              <DrawPath {...P_BRUSH} progress={pDraw} stroke="url(#cpP)" strokeWidth={130} />
            </G>
          </Svg>
        </Animated.View>

        {/* The tower, revealed from the ground up by a growing window. */}
        <Animated.View style={[styles.clip, { bottom: belowBase }, towerClip]}>
          <View style={[styles.towerFrame, { width: size, height: size, bottom: -belowBase }]}>
            <Svg width={size} height={size} viewBox={VIEWBOX}>
              <BlueGradient id="cpT" />
              <Path d={LOGO_TOWER} fill="url(#cpT)" fillRule="evenodd" />
            </Svg>
          </View>
          <Animated.View style={[styles.towerFrame, { width: size, height: size, bottom: -belowBase }, floorsStyle]}>
            <Svg width={size} height={size} viewBox={VIEWBOX}>
              <Defs>
                <ClipPath id="cpTowerClip">
                  <Path d={LOGO_TOWER} clipRule="evenodd" />
                </ClipPath>
              </Defs>
              <G clipPath="url(#cpTowerClip)">
                <Path d={FLOOR_LINES} stroke="rgba(255,255,255,0.45)" strokeWidth={4} />
              </G>
            </Svg>
          </Animated.View>
        </Animated.View>

        {/* The real logo fades in over the vector build once every part is in place. */}
        <Animated.View style={[layer, glossStyle]}>
          <Image source={GLOSS} style={{ width: size, height: size }} fadeDuration={0} />
        </Animated.View>

        {/* Crane rides the top of the build; its mast stands on the roof near the tower's right. */}
        <Animated.View style={[styles.crane, { left: x(650) - 118 * k, bottom: belowBase, width: craneW }, craneStyle]}>
          <Crane size={craneW} />
        </Animated.View>
      </Animated.View>

      {/* Slot reserved at the text's full line height (descenders included) so the wordmark never
          overlaps what sits below it and nothing shifts when it appears. */}
      <View style={{ height: wordLine, marginTop: 6, justifyContent: "center" }}>
        {showWord ? (
          <Animated.View entering={reduced ? undefined : FadeInDown.duration(520)}>
            <Text style={[styles.word, { fontSize: wordSize, lineHeight: wordLine }]} numberOfLines={1}>
              CompareProjects
            </Text>
          </Animated.View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  clip: { position: "absolute", left: 0, right: 0, overflow: "hidden" },
  towerFrame: { position: "absolute", left: 0 },
  crane: { position: "absolute" },
  word: { fontWeight: "800", color: brand.violet, letterSpacing: -0.5 },
});
