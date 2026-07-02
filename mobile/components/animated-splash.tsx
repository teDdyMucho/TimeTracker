import { useEffect, useRef } from 'react';
import { Animated, Easing, Image, View } from 'react-native';
import * as Haptics from 'expo-haptics';

// Fire-and-forget haptic; silently ignored on devices without a vibrator.
const tap = (style: Haptics.ImpactFeedbackStyle) =>
  Haptics.impactAsync(style).catch(() => {});

const DARK = '#000000';
const WHITE = '#FFFFFF';

/**
 * Branded open animation over a black plate:
 *   1. BuildOne logo fades + scales up
 *   2. a white underline sweeps in
 *   3. the ARKO (client) logo fades up beneath it
 *   4. the whole plate fades away to reveal the app.
 * Calls onDone when finished.
 */
export default function AnimatedSplash({ onDone }: { onDone: () => void }) {
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.82)).current;
  const logoY = useRef(new Animated.Value(12)).current;
  const lineWidth = useRef(new Animated.Value(0)).current;      // BuildOne underline
  const arkoLineWidth = useRef(new Animated.Value(0)).current;  // ARKO underline
  const plateOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Soft tap as the logos begin to appear.
    tap(Haptics.ImpactFeedbackStyle.Light);

    Animated.sequence([
      // 1. Both logos enter TOGETHER — fade up + settle
      Animated.parallel([
        Animated.timing(logoOpacity, { toValue: 1, duration: 560, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(logoY, { toValue: 0, duration: 640, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.spring(logoScale, { toValue: 1, friction: 7, tension: 60, useNativeDriver: true }),
      ]),
      // 2. Both underlines sweep TOGETHER
      Animated.parallel([
        Animated.timing(lineWidth, { toValue: 1, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
        Animated.timing(arkoLineWidth, { toValue: 1, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
      ]),
      // Hold a beat
      Animated.delay(520),
      // 3. Fade the whole plate away
      Animated.timing(plateOpacity, { toValue: 0, duration: 480, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
    ]).start(({ finished }) => {
      if (finished) onDone();
    });

    // Haptic beats: logos landing, then the underline sweep.
    const t1 = setTimeout(() => tap(Haptics.ImpactFeedbackStyle.Medium), 620);
    const t2 = setTimeout(() => tap(Haptics.ImpactFeedbackStyle.Light), 1060);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: DARK,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: plateOpacity,
        zIndex: 100,
      }}
    >
      {/* Both logos share one entrance so they appear TOGETHER */}
      <Animated.View
        style={{
          opacity: logoOpacity,
          transform: [{ translateY: logoY }, { scale: logoScale }],
          alignItems: 'center',
        }}
      >
        {/* BuildOne */}
        <Image
          source={require('../assets/buildone.png')}
          style={{ width: 240, height: 60, tintColor: WHITE }}
          resizeMode="contain"
        />
        <View style={{ height: 10 }} />
        <Animated.View
          style={{
            height: 3,
            borderRadius: 3,
            backgroundColor: WHITE,
            width: lineWidth.interpolate({ inputRange: [0, 1], outputRange: [0, 180] }),
          }}
        />

        <View style={{ height: 30 }} />

        {/* ARKO (client) — now with its own underline sweep */}
        <Image
          source={require('../assets/arko.png')}
          style={{ width: 150, height: 54, tintColor: WHITE }}
          resizeMode="contain"
        />
        <View style={{ height: 10 }} />
        <Animated.View
          style={{
            height: 3,
            borderRadius: 3,
            backgroundColor: WHITE,
            width: arkoLineWidth.interpolate({ inputRange: [0, 1], outputRange: [0, 120] }),
          }}
        />
      </Animated.View>
    </Animated.View>
  );
}
