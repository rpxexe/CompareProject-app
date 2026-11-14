import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Platform, StyleSheet, View } from "react-native";
import Re, {
  runOnJS,
  SensorType,
  useAnimatedReaction,
  useAnimatedSensor,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
  Easing as ReEasing,
} from "react-native-reanimated";
import Svg, { Circle, Defs, Path, RadialGradient, Stop } from "react-native-svg";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import useReducedMotion, { isReducedMotion } from "../../hooks/useReducedMotion";
import { LogoMark } from "../Logo";
import { Crane } from "../LogoBuild";
import CompareIcon from "../CompareIcon";
import CityLandmark from "../CityLandmark";
import PressableScale from "../PressableScale";
import Reveal from "../Reveal";
import RollingPlaceholder from "../RollingPlaceholder";
import Text from "../AppText";
import { useSplashDone } from "../../utils/splashGate";
import { brand, colors, fonts, gradients, radius } from "../../theme";

// What the compare table actually lines up, so the headline promises only what the app does.
export const HERO_WORDS = ["price", "locality", "developer", "amenities", "RERA status"];

// Shortcuts into the search form, each with its context preselected.
const SHORTCUTS = [
  { context: "buy_residential", label: "Buy", icon: "key-outline" },
  { context: "rent_residential", label: "Rent", icon: "home-outline" },
  { context: "new_projects", label: "New Projects", icon: "business-outline" },
];

// One hue throughout: brand blue for accents, ink for text, pale tints of the same blue for the city.
const BLUE = brand.violet;
const SKY = ["#E3EBFF", "#EEF3FF", "#F8FAFF"];
const LAYERS = [
  // depth = how far the layer travels with tilt (0 = fixed, 1 = most); far → near.
  { key: "far", depth: 0.3, height: 240, fill: "#D5E0FF", windows: "#E0E8FF", seed: 7, minW: 18, maxW: 34, minH: 110, maxH: 240, gap: 2 },
  { key: "mid", depth: 0.6, height: 180, fill: "#BCCDFF", windows: "#D5E0FF", seed: 23, minW: 20, maxW: 38, minH: 70, maxH: 180, gap: 5 },
  { key: "near", depth: 1, height: 118, fill: "#A3BAFF", windows: "#BFD0FF", seed: 41, minW: 24, maxW: 44, minH: 40, maxH: 118, gap: 8 },
]
const OVERSCAN = 26; // layers are this much wider on each side so tilting never shows an edge
const TILT_X = 18; // px the nearest layer moves at full tilt
const TILT_Y = 8;
const TILT_DEAD_ZONE = 0.03; // of full tilt (~0.5 px on the nearest layer)

const H1 = 30;
const LINE = 37;
const easeOut = Easing.bezier(0.16, 1, 0.3, 1);

// Entrance choreography (ms after mount).
const AT = { city: 150, logo: 120, bell: 260, location: 360, line1: 460, word: 720, sub: 840, chips: 920, search: 1120 };

// ---------------------------------------------------------------------------------------------
// Procedural skyline: deterministic per seed; the towers stand on the right, clear of the text.
// Each building is its own element so the city can be "constructed" one building at a time.
function rng(seed) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

// Construction timing per layer (ms on the city clock): far layer first, tall right-hand towers
// before the low ones on the left.
const BUILD = { far: { start: 0, stagger: 42 }, mid: { start: 200, stagger: 52 }, near: { start: 400, stagger: 58 } };
const CITY_MS = 2300;
const LIGHTS_MS = 450; // windows fading on after a layer is built

function planSkyline({ key, width, height, seed, minW, maxW, minH, maxH, gap, windows }) {
  const r = rng(seed);
  const list = [];
  let lines = "";
  let x = -4;
  while (x < width) {
    const w = Math.round(minW + r() * (maxW - minW));
    // Low on the left (behind the headline and buttons), rising to full height on the right.
    const t = Math.min(1, Math.max(0, x / width));
    const bias = 0.14 + 0.86 * Math.pow(t, 1.5);
    const h = Math.round(Math.max(14, (minH + r() * (maxH - minH)) * bias));
    const kind = r();
    const roof = kind < 0.18 ? "peak" : kind < 0.36 ? "antenna" : kind > 0.82 ? "crown" : null;
    const roofH = roof === "peak" ? Math.round(Math.min(16, w * 0.6)) : roof === "antenna" ? 12 : roof === "crown" ? 8 : 0;
    list.push({ x: Math.round(x), w, h, roof, roofH, jitter: r() * 70 });
    if (windows && h > 24) {
      const top = height - h;
      for (let y = top + 7; y < height - 6; y += 8) lines += `M${x + 4} ${y}H${x + w - 4}`;
    }
    x += w + r() * gap;
  }
  // Build order: right to left.
  const { start, stagger } = BUILD[key];
  [...list]
    .sort((a, b) => b.x - a.x)
    .forEach((bld, rank) => {
      bld.start = start + rank * stagger + bld.jitter;
      bld.dur = 340 + bld.h * 1.6;
      bld.floors = Math.max(2, Math.round(bld.h / 14));
    });
  const done = Math.max(...list.map((b) => b.start + b.dur));
  const tallest = list.reduce((m, b) => (b.h > m.h ? b : m), list[0]);
  // The finished skyline as one path (every body and roof), drawn by a single SVG.
  const shape = list.map((b) => bodyPath(b, height) + roofPath(b, b.x, height - b.h - b.roofH)).join("");
  return { list, lines, done, tallest, shape };
}

function bodyPath(b, height) {
  return `M${b.x} ${height - b.h}H${b.x + b.w}V${height}H${b.x}Z`;
}

// Height built so far for a building on the city clock: floor by floor, each easing into place.
function builtAt(clock, b) {
  "worklet";
  const p = Math.min(1, Math.max(0, (clock - b.start) / b.dur));
  if (p >= 1) return 1;
  const q = p * b.floors;
  const i = Math.floor(q);
  const f = q - i;
  return (i + (1 - Math.pow(1 - f, 3))) / b.floors;
}

// A building's roof; `ox` / `oy` place it (0, 0 = inside the building's own box).
function roofPath(b, ox = 0, oy = 0) {
  const { w, roofH: rh } = b;
  if (!b.roof) return "";
  if (b.roof === "peak") return `M${ox} ${oy + rh}L${ox + w / 2} ${oy}L${ox + w} ${oy + rh}Z`;
  if (b.roof === "antenna") return `M${ox + w / 2 - 1} ${oy + rh}V${oy}H${ox + w / 2 + 1}V${oy + rh}Z`;
  return `M${ox + w * 0.2} ${oy + rh}V${oy}H${ox + w * 0.8}V${oy + rh}Z`;
}

const Building = React.memo(function Building({ b, fill, clock }) {
  const a = useAnimatedStyle(() => {
    const s = builtAt(clock.value, b);
    return { opacity: s > 0 ? 1 : 0, transform: [{ scaleY: Math.max(0.0001, s) }] };
  });
  return (
    <Re.View style={[styles.building, { left: b.x, width: b.w, height: b.h + b.roofH }, a]}>
      {b.roof ? (
        <Svg width={b.w} height={b.roofH} style={styles.roof}>
          <Path d={roofPath(b)} fill={fill} />
        </Svg>
      ) : null}
      <View style={[styles.body, { height: b.h, backgroundColor: fill }]} />
    </Re.View>
  );
});

// The splash's tower crane, riding the roof of the tallest building while it goes up, then
// lifting away once it's topped out.
const CRANE_W = 46;
const CRANE_MAST = (118 / 150) * CRANE_W; // mast's x inside the drawing
function SiteCrane({ b, clock }) {
  const a = useAnimatedStyle(() => {
    const s = builtAt(clock.value, b);
    const appear = Math.min(1, Math.max(0, (clock.value - b.start + 120) / 200));
    const out = Math.min(1, Math.max(0, (clock.value - (b.start + b.dur + 120)) / 420));
    return {
      opacity: appear * (1 - out),
      transform: [{ translateY: -s * b.h - out * 22 }],
    };
  });
  return (
    <Re.View style={[styles.crane, { left: b.x + b.w / 2 - CRANE_MAST }, a]}>
      <Crane size={CRANE_W} />
    </Re.View>
  );
}

// While the city is being built every building is its own animated view (dozens per layer, each
// with an SVG roof). Once the layer is finished it is swapped for ONE static SVG of the same
// drawing: the screen redraws all of its views on every frame (scrolling, any animation), and on
// budget phones those ~150 views and ~45 SVG canvases cost more than a frame's budget.
const SkylineLayer = React.memo(function SkylineLayer({ layer, width, clock, crane }) {
  const w = width + OVERSCAN * 2;
  const plan = useMemo(() => planSkyline({ ...layer, width: w }), [layer, w]);
  const [built, setBuilt] = useState(false);
  useAnimatedReaction(
    // After the windows have lit and the crane has lifted away (up to ~540 ms after its building).
    () => clock.value >= plan.done + 650,
    (done, prev) => {
      if (done && prev !== true) runOnJS(setBuilt)(true);
    },
    [plan],
  );
  // Windows light up once the whole layer is built.
  const lights = useAnimatedStyle(() => ({ opacity: Math.min(1, Math.max(0, (clock.value - plan.done) / LIGHTS_MS)) }));
  if (built) {
    return (
      <Svg width={w} height={layer.height} viewBox={`0 0 ${w} ${layer.height}`}>
        <Path d={plan.shape} fill={layer.fill} />
        {plan.lines ? <Path d={plan.lines} stroke={layer.windows} strokeWidth={2} strokeLinecap="round" /> : null}
      </Svg>
    );
  }
  return (
    <View style={{ width: w, height: layer.height }}>
      {plan.list.map((b) => (
        <Building key={b.x} b={b} fill={layer.fill} clock={clock} />
      ))}
      {plan.lines ? (
        <Re.View style={[StyleSheet.absoluteFill, lights]}>
          <Svg width={w} height={layer.height} viewBox={`0 0 ${w} ${layer.height}`}>
            <Path d={plan.lines} stroke={layer.windows} strokeWidth={2} strokeLinecap="round" />
          </Svg>
        </Re.View>
      ) : null}
      {crane ? <SiteCrane b={plan.tallest} clock={clock} /> : null}
    </View>
  );
});

// Reads the gravity sensor while mounted and writes a smoothed tilt (-1…1) into tx / ty. The
// resting pose re-centres slowly, so holding the phone at any angle settles back to neutral and
// only movement produces parallax. Unmounting stops the sensor (Home hidden / reduced motion).
function GyroDriver({ tx, ty }) {
  const { sensor } = useAnimatedSensor(SensorType.GRAVITY, { interval: 20 });
  const bx = useSharedValue(0);
  const by = useSharedValue(0);
  const ready = useSharedValue(0);

  useAnimatedReaction(
    () => sensor.value,
    (g) => {
      if (!g || (g.x === 0 && g.y === 0 && g.z === 0)) return;
      if (!ready.value) {
        bx.value = g.x;
        by.value = g.y;
        ready.value = 1;
        return;
      }
      bx.value += (g.x - bx.value) * 0.01;
      by.value += (g.y - by.value) * 0.01;
      const nx = Math.max(-1, Math.min(1, (g.x - bx.value) / 2.6));
      const ny = Math.max(-1, Math.min(1, (g.y - by.value) / 2.6));
      // Dead zone: sensor noise on a still phone moves the layers by a fraction of a pixel, which
      // still forces a full redraw on every reading (50 a second). Only real movement does.
      const dx = nx - tx.value;
      const dy = ny - ty.value;
      if (Math.abs(dx) < TILT_DEAD_ZONE && Math.abs(dy) < TILT_DEAD_ZONE) return;
      tx.value += dx * 0.18;
      ty.value += dy * 0.18;
    },
  );

  useEffect(
    () => () => {
      tx.value = withSpring(0, { damping: 18 });
      ty.value = withSpring(0, { damping: 18 });
    },
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );
  return null;
}

function ParallaxLayer({ depth, tx, ty, style, children }) {
  const a = useAnimatedStyle(() => ({
    transform: [{ translateX: -tx.value * depth * TILT_X }, { translateY: ty.value * depth * TILT_Y }],
  }));
  return <Re.View style={[style, a]} pointerEvents="none">{children}</Re.View>;
}

function CityBackdrop({ width, focused, reduced }) {
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  // One clock (ms) drives the whole construction; reduced motion starts with the city finished.
  const clock = useSharedValue(reduced ? CITY_MS : 0);
  const hasWidth = width > 0;
  useEffect(() => {
    if (reduced || !hasWidth) return;
    clock.value = withDelay(AT.city, withTiming(CITY_MS, { duration: CITY_MS, easing: ReEasing.linear }));
  }, [hasWidth]); // eslint-disable-line react-hooks/exhaustive-deps
  const glow = useAnimatedStyle(() => ({ opacity: Math.min(1, clock.value / 600) }));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {focused && !reduced ? <GyroDriver tx={tx} ty={ty} /> : null}
      <LinearGradient colors={SKY} style={StyleSheet.absoluteFill} />
      {/* Soft light behind the towers, top-right; moves least. */}
      <ParallaxLayer depth={0.15} tx={tx} ty={ty} style={styles.glow}>
        <Re.View style={glow}>
          <Svg width={260} height={260}>
            <Defs>
              <RadialGradient id="heroGlow" cx="130" cy="130" r="130" gradientUnits="userSpaceOnUse">
                <Stop offset="0" stopColor={BLUE} stopOpacity="0.16" />
                <Stop offset="1" stopColor={BLUE} stopOpacity="0" />
              </RadialGradient>
            </Defs>
            <Circle cx="130" cy="130" r="130" fill="url(#heroGlow)" />
          </Svg>
        </Re.View>
      </ParallaxLayer>
      {width
        ? LAYERS.map((l) => (
            <ParallaxLayer key={l.key} depth={l.depth} tx={tx} ty={ty} style={[styles.layer, { height: l.height }]}>
              <SkylineLayer layer={l} width={width} clock={clock} crane={l.key === "mid" && !reduced} />
            </ParallaxLayer>
          ))
        : null}
      {/* Fades the street level into white where the search bar overlaps. */}
      <LinearGradient colors={["rgba(248,250,255,0)", "rgba(248,250,255,0.85)"]} style={styles.street} />
    </View>
  );
}

// ---------------------------------------------------------------------------------------------
// Springs its child in from an offset (x / y / scale / rotate). The spring's slight overshoot gives
// each element a small settle as it lands. Reduced motion: shown in place.
function Pop({ delay = 0, from = {}, config, style, children }) {
  const v = useRef(new Animated.Value(isReducedMotion() ? 1 : 0)).current;
  useEffect(() => {
    if (isReducedMotion()) return;
    Animated.spring(v, { toValue: 1, delay, stiffness: 170, damping: 13, mass: 0.8, useNativeDriver: true, ...config }).start();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const { x = 0, y = 0, scale = 1, rotate = 0 } = from;
  const tween = (a, b) => v.interpolate({ inputRange: [0, 1], outputRange: [a, b] });
  return (
    <Animated.View
      style={[
        style,
        {
          opacity: v.interpolate({ inputRange: [0, 0.35, 1], outputRange: [0, 1, 1], extrapolate: "clamp" }),
          transform: [{ translateX: tween(x, 0) }, { translateY: tween(y, 0) }, { scale: tween(scale, 1) }, { rotate: tween(`${rotate}deg`, "0deg") }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------------------------
// Logo: blue app-icon tile that pops in; "Compare" and "Projects" arrive from opposite sides, then
// every so often play a little "compare" moment (see the rubber-band effect below).
// "Compare" stays anchored next to the tile; only "Projects" moves, opening a gap this wide.
const SEAM_GAP = 22;
const spring = (v, toValue, cfg) =>
  Animated.spring(v, { toValue, useNativeDriver: true, restDisplacementThreshold: 0.001, restSpeedThreshold: 0.001, ...cfg });

function HeroLogo({ reduced, focused }) {
  const mark = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  const word = useRef(new Animated.Value(reduced ? 1 : 0)).current; // the two halves arriving
  const split = useRef(new Animated.Value(0)).current; // 0 together · 1 pulled apart (overshoots both ways)
  const jelly = useRef(new Animated.Value(0)).current; // squash (+) / stretch (−) of the words
  const icon = useRef(new Animated.Value(0)).current; // ⇌ in the gap, 0 hidden · 1 shown
  const wiggle = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduced) return;
    Animated.sequence([Animated.delay(AT.logo), spring(mark, 1, { speed: 9, bounciness: 9 })]).start();
    Animated.timing(word, { toValue: 1, duration: 640, delay: AT.logo + 200, easing: easeOut, useNativeDriver: true }).start();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Rubber band: the words stretch apart, the ⇌ pops into the gap with a wiggle, holds, pops
  // out, and the words snap back together with a soft squash that settles in about one bounce.
  // Once after the entrance, then every ~7 s while Home is shown.
  useEffect(() => {
    if (reduced || !focused) return undefined;
    const kick = (v, to, d) => Animated.timing(v, { toValue: to, duration: d, easing: Easing.inOut(Easing.quad), useNativeDriver: true });
    const cycle = Animated.sequence([
      // 1. Stretch apart: a quick pull (words stretch) that springs out to the gap.
      Animated.parallel([
        spring(split, 1, { stiffness: 220, damping: 17, mass: 0.8 }),
        Animated.sequence([kick(jelly, -0.5, 110), spring(jelly, 0, { stiffness: 240, damping: 14 })]),
      ]),
      // 2. The compare sign pops into the gap and wiggles.
      Animated.parallel([
        spring(icon, 1, { stiffness: 300, damping: 14 }),
        Animated.sequence([Animated.delay(60), kick(wiggle, 1, 140), kick(wiggle, -0.5, 180), kick(wiggle, 0, 160)]),
      ]),
      Animated.delay(750),
      // 3. Sign pops out…
      Animated.timing(icon, { toValue: 0, duration: 170, easing: Easing.in(Easing.back(2)), useNativeDriver: true }),
      // 4. …and the band snaps shut with a soft squash.
      Animated.parallel([
        spring(split, 0, { stiffness: 300, damping: 14, mass: 0.7 }),
        Animated.sequence([Animated.delay(70), kick(jelly, 0.7, 80), spring(jelly, 0, { stiffness: 260, damping: 11, mass: 0.7 })]),
      ]),
    ]);
    // Once per visit: a repeating loop kept the whole screen redrawing every few seconds.
    const run = Animated.sequence([Animated.delay(AT.logo + 1100), cycle]);
    run.start();
    return () => {
      run.stop();
      [split, jelly, icon, wiggle].forEach((v) => v.setValue(0));
    };
  }, [reduced, focused]); // eslint-disable-line react-hooks/exhaustive-deps

  // "Compare" (dir -1) never moves left and squashes from its left edge, so it can't run into the
  // tile; "Projects" (dir +1) does the travelling and squashes from the seam.
  const half = (dir) => ({
    opacity: word,
    transformOrigin: "left",
    transform: [
      { translateX: word.interpolate({ inputRange: [0, 1], outputRange: [dir < 0 ? 8 : 22, 0] }) },
      ...(dir > 0 ? [{ translateX: split.interpolate({ inputRange: [-1, 1], outputRange: [-SEAM_GAP, SEAM_GAP] }) }] : []),
      { scaleX: jelly.interpolate({ inputRange: [-1, 0, 1], outputRange: [1.05, 1, 0.93] }) },
      { scaleY: jelly.interpolate({ inputRange: [-1, 0, 1], outputRange: [0.96, 1, 1.06] }) },
    ],
  });

  return (
    <View style={styles.logo} accessible accessibilityRole="image" accessibilityLabel="CompareProjects">
      {/* App-icon tile: blue gradient square, white CP mark; the tile pops in with a small turn. */}
      <Animated.View
        style={[
          styles.logoTile,
          {
            opacity: mark.interpolate({ inputRange: [0, 0.4], outputRange: [0, 1], extrapolate: "clamp" }),
            transform: [
              { scale: mark.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) },
              { rotate: mark.interpolate({ inputRange: [0, 1], outputRange: ["-25deg", "0deg"] }) },
            ],
          },
        ]}
      >
        <LinearGradient colors={gradients.cta} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        {/* Soft top-left sheen so the tile reads as an icon rather than a flat square. */}
        <LinearGradient colors={["rgba(255,255,255,0.28)", "rgba(255,255,255,0)"]} start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 0.6 }} style={StyleSheet.absoluteFill} />
        <LogoMark size={22} tint={colors.white} />
      </Animated.View>
      <View style={styles.logoWordRow}>
        <Animated.View style={half(-1)}>
          <Text numberOfLines={1} style={styles.logoWord}>
            Compare
          </Text>
        </Animated.View>
        <Animated.View style={half(1)}>
          <Text numberOfLines={1} style={styles.logoWord}>
            Projects
          </Text>
          {/* Centred in the gap: "Projects" sits SEAM_GAP to the right while the sign shows. */}
          <Animated.View
            pointerEvents="none"
            style={[
              styles.logoSign,
              {
                opacity: icon.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 1] }),
                transform: [
                  { scale: icon },
                  { rotate: wiggle.interpolate({ inputRange: [-1, 1], outputRange: ["-14deg", "14deg"] }) },
                ],
              },
            ]}
          >
            <CompareIcon size={15} color={BLUE} />
          </Animated.View>
        </Animated.View>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------------------------
// Bell: white glass circle. Drops in from above and swings as it lands; rings again when Home is
// shown with something unread, and the badge pops in.
function BellButton({ unread, focused, reduced, onPress }) {
  const enter = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  const swing = useRef(new Animated.Value(0)).current;
  const badge = useRef(new Animated.Value(unread > 0 ? 1 : 0)).current;

  useEffect(() => {
    if (reduced) return;
    const kick = (to, d) => Animated.timing(swing, { toValue: to, duration: d, easing: Easing.inOut(Easing.quad), useNativeDriver: true });
    Animated.sequence([
      Animated.spring(enter, { toValue: 1, delay: AT.bell, stiffness: 220, damping: 12, mass: 0.8, useNativeDriver: true }),
      kick(0.7, 120),
      kick(-0.45, 150),
      kick(0.2, 130),
      kick(0, 120),
    ]).start();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Badge in/out, and a short ring each time Home is shown with unread notifications.
  useEffect(() => {
    if (isReducedMotion()) {
      badge.setValue(unread > 0 ? 1 : 0);
      return undefined;
    }
    Animated.spring(badge, { toValue: unread > 0 ? 1 : 0, speed: 14, bounciness: 12, useNativeDriver: true }).start();
    if (!(unread > 0 && focused)) return undefined;
    const kick = (to, d = 90) => Animated.timing(swing, { toValue: to, duration: d, easing: Easing.inOut(Easing.quad), useNativeDriver: true });
    const ring = Animated.sequence([Animated.delay(900), kick(1), kick(-0.85), kick(0.6), kick(-0.4), kick(0.2), kick(0, 120)]);
    ring.start();
    return () => ring.stop();
  }, [unread, focused]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <PressableScale onPress={onPress} to={0.9} hitSlop={6} accessibilityRole="button" accessibilityLabel={unread ? `Notifications, ${unread} unread` : "Notifications"}>
      <Animated.View
        style={[
          styles.bell,
          {
            opacity: enter.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 1], extrapolate: "clamp" }),
            transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [-30, 0] }) }],
          },
        ]}
      >
        <Animated.View
          style={{ transformOrigin: "50% 8%", transform: [{ rotate: swing.interpolate({ inputRange: [-1, 1], outputRange: ["-16deg", "16deg"] }) }] }}
        >
          <Ionicons name={unread ? "notifications" : "notifications-outline"} size={19} color={brand.ink} />
        </Animated.View>
        <Animated.View pointerEvents="none" style={[styles.badge, { opacity: badge, transform: [{ scale: badge }] }]}>
          <Text style={styles.badgeText}>{unread > 9 ? "9+" : unread || ""}</Text>
        </Animated.View>
      </Animated.View>
    </PressableScale>
  );
}

// ---------------------------------------------------------------------------------------------
// Compact location pill: tiny landmark of the city, then "Locality, City".
function LocationPill({ locality, city, detecting, reduced, onPress }) {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!detecting || reduced) {
      pulse.setValue(0);
      return undefined;
    }
    const loop = Animated.loop(Animated.timing(pulse, { toValue: 1, duration: 1300, easing: Easing.out(Easing.quad), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [detecting, reduced]); // eslint-disable-line react-hooks/exhaustive-deps

  // Locality leads in bold; the city follows in a softer tone. Without either: All India.
  const place = detecting ? "Locating…" : locality || city || "All India";
  const rest = !detecting && locality && city ? city : "";

  return (
    <Pop delay={AT.location} from={{ x: -22 }} style={styles.locWrap}>
      <PressableScale
        onPress={onPress}
        to={0.96}
        style={styles.loc}
        accessibilityRole="button"
        accessibilityLabel={`Location: ${[place, rest].filter(Boolean).join(", ")}. Change location`}
      >
        <View style={styles.locIcon}>
          {detecting ? (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.locPulse,
                {
                  opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] }),
                  transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.7] }) }],
                },
              ]}
            />
          ) : null}
          {/* Re-keyed per city so the new landmark pops in when the city changes. */}
          <Reveal key={city || "all"} distance={4}>
            <CityLandmark city={city} size={20} stroke={BLUE} fill="#E6EEFF" hole={colors.white} strokeWidth={2.4} />
          </Reveal>
        </View>
        <Text style={styles.locText} numberOfLines={1}>
          <Text style={styles.locTitle}>{place}</Text>
          {rest ? <Text style={styles.locCity}>{`, ${rest}`}</Text> : null}
        </Text>
        <Ionicons name="chevron-down" size={12} color={brand.ink} />
      </PressableScale>
    </Pop>
  );
}

// ---------------------------------------------------------------------------------------------
// Headline words pop up one after another.
const HEAD_WORDS = ["Compare", "homes", "by"];

// A word that rolls up through a one-line slot; an underline draws in beneath it once it lands.
function Slide({ word, leaving, delay, onGone }) {
  const reduced = isReducedMotion();
  const v = useRef(new Animated.Value(reduced ? 1 : 0)).current; // 0 below · 1 shown · 2 gone above
  const u = useRef(new Animated.Value(reduced ? 1 : 0)).current;

  useEffect(() => {
    if (reduced) return;
    Animated.sequence([
      Animated.timing(v, { toValue: 1, duration: 620, delay, easing: easeOut, useNativeDriver: true }),
      Animated.timing(u, { toValue: 1, duration: 460, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!leaving) return;
    if (isReducedMotion()) return onGone();
    Animated.parallel([
      Animated.timing(u, { toValue: 0, duration: 200, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      Animated.timing(v, { toValue: 2, duration: 460, delay: 120, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
    ]).start(() => onGone());
  }, [leaving]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Animated.View
      style={[
        styles.slide,
        {
          opacity: v.interpolate({ inputRange: [0, 0.6, 1, 1.5, 2], outputRange: [0, 1, 1, 1, 0] }),
          transform: [{ translateY: v.interpolate({ inputRange: [0, 1, 2], outputRange: [LINE, 0, -LINE] }) }],
        },
      ]}
    >
      <Text style={[styles.h1, styles.h1Accent]} numberOfLines={1}>
        {word}
      </Text>
      <Animated.View style={[styles.underline, { transform: [{ scaleX: u }] }]} />
    </Animated.View>
  );
}

// Rolls through every word once, ending back on the first, then stays: endless rolling kept the
// whole screen redrawing (each frame redraws every view on it). A new `run` (Home shown again)
// plays another pass.
function RollingWord({ words, active, run = 0, interval = 2800 }) {
  const next = useRef(1); // key (and word index) of the next slide; keeps counting across passes
  const passEnd = useRef(words.length); // last key of the current pass
  const lastRun = useRef(run);
  const [slides, setSlides] = useState([{ key: 0, word: words[0], leaving: false }]);

  useEffect(() => {
    if (run !== lastRun.current) {
      lastRun.current = run;
      passEnd.current = next.current + words.length - 1;
    }
    if (!active || words.length < 2 || next.current > passEnd.current) return undefined;
    const id = setInterval(() => {
      const key = next.current++;
      setSlides((s) => [...s.map((x) => ({ ...x, leaving: true })), { key, word: words[key % words.length], leaving: false }]);
      if (key >= passEnd.current) clearInterval(id);
    }, interval);
    return () => clearInterval(id);
  }, [active, words, interval, run]);

  const drop = (key) => setSlides((s) => s.filter((x) => x.key !== key));

  return (
    <View style={styles.slot} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      {slides.map((s) => (
        <Slide key={s.key} word={s.word} leaving={s.leaving} delay={s.key === 0 ? AT.word : 160} onGone={() => drop(s.key)} />
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------------------------
// Home is mounted under the launch splash, so the hero is re-mounted once the splash starts to
// leave: its entrance (city construction and all) then plays in view instead of behind it.
// Until then the copy underneath is kept invisible: otherwise, as the splash fades, the finished
// hero shows through for a moment and then snaps away when the fresh copy replaces it (a flash).
export default function HomeHero(props) {
  const intro = useSplashDone();
  return (
    <View style={intro ? null : PRE_INTRO}>
      <HeroBody key={intro ? "intro" : "hidden"} {...props} />
    </View>
  );
}
const PRE_INTRO = { opacity: 0 };

// `focused`: Home is the open screen (the logo stretch and bell ring play once each time it's shown).
// `onScreen`: the hero is scrolled into view; the tilt sensor and rolling text run only while it is.
function HeroBody({ locality, city, detecting, unread, focused, onScreen = true, onLocation, onNotifications, onSearch }) {
  const live = focused && onScreen;
  // Counts returns to Home: the rolling word and search placeholder play one more pass each time
  // (they stop after a pass so the screen can settle; scrolling back up doesn't count as a return).
  const [run, setRun] = useState(0);
  const wasFocused = useRef(focused);
  useEffect(() => {
    if (focused && !wasFocused.current) setRun((n) => n + 1);
    wasFocused.current = focused;
  }, [focused]);
  const reduced = useReducedMotion();
  const [cardW, setCardW] = useState(0);
  const card = useRef(new Animated.Value(isReducedMotion() ? 1 : 0)).current;
  useEffect(() => {
    if (isReducedMotion()) return;
    Animated.timing(card, { toValue: 1, duration: 420, easing: easeOut, useNativeDriver: true }).start();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View>
      <Animated.View style={[styles.cardShadow, { opacity: card }]}>
        <View style={styles.card} onLayout={(e) => setCardW(Math.round(e.nativeEvent.layout.width))}>
          <CityBackdrop width={cardW} focused={live} reduced={reduced} />

          <View style={styles.top}>
            <HeroLogo reduced={reduced} focused={focused} />
            <BellButton unread={unread} focused={focused} reduced={reduced} onPress={onNotifications} />
          </View>

          <LocationPill locality={locality} city={city} detecting={detecting} reduced={reduced} onPress={onLocation} />

          <View
            style={styles.headline}
            accessible
            accessibilityRole="header"
            accessibilityLabel={`Compare homes by ${HERO_WORDS.slice(0, -1).join(", ")} and ${HERO_WORDS[HERO_WORDS.length - 1]}`}
          >
            <View style={styles.headRow}>
              {HEAD_WORDS.map((w, i) => (
                <Pop key={w} delay={AT.line1 + i * 80} from={{ y: 22, scale: 0.9 }}>
                  <Text style={styles.h1}>{w}</Text>
                </Pop>
              ))}
            </View>
            <RollingWord words={HERO_WORDS} active={live} run={run} />
          </View>
          <Pop delay={AT.sub} from={{ y: 10 }}>
            <Text style={styles.sub}>Side by side, before you commit.</Text>
          </Pop>

          <View style={styles.chips}>
            {SHORTCUTS.map((s, i) => (
              <Pop key={s.context} delay={AT.chips + i * 80} from={{ y: 8, scale: 0.6 }}>
                <PressableScale
                  to={0.94}
                  onPress={() => onSearch(s.context)}
                  style={styles.chip}
                  accessibilityRole="button"
                  accessibilityLabel={s.label}
                  accessibilityHint={`Opens search with ${s.label} selected`}
                >
                  <Ionicons name={s.icon} size={14} color={BLUE} />
                  <Text style={styles.chipText} maxFontSizeMultiplier={1.3}>
                    {s.label}
                  </Text>
                </PressableScale>
              </Pop>
            ))}
          </View>
        </View>
      </Animated.View>

      {/* Search bar straddling the card's bottom edge. */}
      <Pop delay={AT.search} from={{ y: 28, scale: 0.96 }} style={styles.searchWrap}>
        <PressableScale
          onPress={() => onSearch()}
          to={0.98}
          style={styles.search}
          accessibilityRole="search"
          accessibilityLabel="Search properties"
          accessibilityHint="Opens search with filters"
        >
          <LinearGradient colors={["#3A6BFF", "#2457FF", "#1A44E0"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.searchIcon}>
            <Ionicons name="search" size={17} color={colors.white} />
          </LinearGradient>
          <RollingPlaceholder active={live} passes={1} run={run} style={styles.searchInput} />
          <View style={styles.searchDivider} />
          <Ionicons name="options-outline" size={19} color={BLUE} style={{ marginRight: 4 }} />
        </PressableScale>
      </Pop>
    </View>
  );
}

// Frosted white on the pale-blue sky.
const glass = { backgroundColor: "rgba(255, 255, 255, 0.78)", borderWidth: 1, borderColor: "rgba(36, 87, 255, 0.10)" };

const styles = StyleSheet.create({
  // Shadow lives on a wrapper (iOS clips shadows on overflow:hidden views). No Android
  // elevation here, or the card would draw over the overlapping search bar below it.
  cardShadow: {
    marginHorizontal: 12,
    marginTop: 2,
    borderRadius: 30,
    ...Platform.select({
      ios: { shadowColor: brand.deep, shadowOpacity: 0.1, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } },
      default: {},
    }),
  },
  card: {
    borderRadius: 30,
    overflow: "hidden",
    backgroundColor: SKY[1],
    borderWidth: 1,
    borderColor: "rgba(36, 87, 255, 0.08)",
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 50,
  },
  glow: { position: "absolute", top: -90, right: -70 },
  layer: { position: "absolute", left: -OVERSCAN, bottom: 0 },
  building: { position: "absolute", bottom: 0, transformOrigin: "bottom" },
  roof: { position: "absolute", top: 0, left: 0 },
  body: { position: "absolute", left: 0, right: 0, bottom: 0 },
  crane: { position: "absolute", bottom: 0 },
  street: { position: "absolute", left: 0, right: 0, bottom: 0, height: 46 },

  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 42 },
  logo: { flexDirection: "row", alignItems: "center" },
  logoTile: {
    width: 36,
    height: 36,
    borderRadius: 11,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      android: { elevation: 3 },
      default: { shadowColor: BLUE, shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
    }),
  },
  logoWordRow: { flexDirection: "row", alignItems: "center", marginLeft: 12, paddingRight: 2 },
  logoSign: { position: "absolute", left: -SEAM_GAP / 2 - 7.5, top: 0, bottom: 0, width: 15, justifyContent: "center" },
  logoWord: { fontSize: 17, fontWeight: "800", color: brand.ink, letterSpacing: -0.4 },

  bell: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", ...glass },
  badge: {
    position: "absolute",
    top: 4,
    right: 3,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: BLUE,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.white,
  },
  badgeText: { color: colors.white, fontSize: 9.5, fontWeight: "800" },

  locWrap: { marginTop: 10, alignSelf: "flex-start", maxWidth: "100%" },
  loc: { flexDirection: "row", alignItems: "center", gap: 6, height: 32, paddingLeft: 5, paddingRight: 11, borderRadius: radius.pill, ...glass },
  locIcon: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.white, alignItems: "center", justifyContent: "center" },
  locPulse: { position: "absolute", width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: BLUE },
  locText: { flexShrink: 1 },
  locTitle: { fontSize: 13, fontWeight: "700", color: brand.ink },
  locCity: { fontSize: 13, fontWeight: "500", color: brand.inkSoft },

  headline: { marginTop: 18 },
  headRow: { flexDirection: "row", flexWrap: "wrap", columnGap: 8 },
  h1: { fontFamily: fonts.serif, fontSize: H1, lineHeight: LINE, fontWeight: "800", color: brand.ink, letterSpacing: -0.9 },
  h1Accent: { color: BLUE },
  slot: { height: LINE + 8, overflow: "hidden" },
  slide: { position: "absolute", left: 0, top: 0, alignItems: "flex-start" },
  underline: { height: 3, borderRadius: 2, marginTop: -2, alignSelf: "stretch", backgroundColor: BLUE, opacity: 0.3, transformOrigin: "left" },
  sub: { fontSize: 14, lineHeight: 20, color: brand.inkSoft, marginTop: 2 },

  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 16 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, height: 36, paddingHorizontal: 13, borderRadius: radius.pill, ...glass, backgroundColor: "rgba(255, 255, 255, 0.9)" },
  chipText: { fontSize: 13, fontWeight: "700", color: brand.ink },

  searchWrap: { marginTop: -30, marginHorizontal: 26 },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    height: 58,
    paddingLeft: 8,
    paddingRight: 12,
    borderRadius: 20,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: "rgba(36, 87, 255, 0.10)",
    ...Platform.select({
      android: { elevation: 8 },
      default: { shadowColor: brand.deep, shadowOpacity: 0.14, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } },
    }),
  },
  searchIcon: { width: 40, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  searchInput: { flex: 1, minHeight: 44 },
  searchDivider: { width: 1, height: 24, backgroundColor: colors.line },
});
