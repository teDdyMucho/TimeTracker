import { useEffect, useRef } from 'react';
import { Animated, Easing, Image, View } from 'react-native';
import * as Haptics from 'expo-haptics';

// Fire-and-forget haptic; silently ignored on devices without a vibrator.
const tap = (style: Haptics.ImpactFeedbackStyle) =>
  Haptics.impactAsync(style).catch(() => {});

const DARK = '#000000';
const BRONZE = '#FFFFFF'; // accent underline — white, to show on the black splash plate

/**
 * Branded open animation: BuildOne logo fades + scales up over a dark plate,
 * a bronze underline sweeps in, then the whole splash fades away to reveal
 * the app underneath. Calls onDone when finished.
 */
export default function AnimatedSplash({ onDone }: { onDone: () => void }) {
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.82)).current;
  const logoY = useRef(new Animated.Value(12)).current;
  const lineWidth = useRef(new Animated.Value(0)).current;
  const plateOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Soft tap as the logo begins to appear.
    tap(Haptics.ImpactFeedbackStyle.Light);

    Animated.sequence([
      // Logo entrance — fade up + settle
      Animated.parallel([
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: 520,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(logoY, {
          toValue: 0,
          duration: 620,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(logoScale, {
          toValue: 1,
          friction: 7,
          tension: 60,
          useNativeDriver: true,
        }),
      ]),
      // White underline sweep
      Animated.timing(lineWidth, {
        toValue: 1,
        duration: 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
      // Hold a beat
      Animated.delay(420),
      // Fade the whole plate away to reveal the screen beneath
      Animated.timing(plateOpacity, {
        toValue: 0,
        duration: 480,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) onDone();
    });

    // Firmer "landing" tap timed to when the logo settles + the underline sweeps.
    const t1 = setTimeout(() => tap(Haptics.ImpactFeedbackStyle.Medium), 620);
    const t2 = setTimeout(() => tap(Haptics.ImpactFeedbackStyle.Light), 1040);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: DARK,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: plateOpacity,
        zIndex: 100,
      }}
    >
      <Animated.View
        style={{
          opacity: logoOpacity,
          transform: [{ translateY: logoY }, { scale: logoScale }],
          alignItems: 'center',
        }}
      >
        <Image
          source={require('../assets/buildone.png')}
          style={{ width: 240, height: 60, tintColor: '#FFFFFF' }}
          resizeMode="contain"
        />
        <View style={{ height: 10 }} />
        <Animated.View
          style={{
            height: 3,
            borderRadius: 3,
            backgroundColor: BRONZE,
            width: lineWidth.interpolate({ inputRange: [0, 1], outputRange: [0, 180] }),
          }}
        />
      </Animated.View>
    </Animated.View>
  );
}
