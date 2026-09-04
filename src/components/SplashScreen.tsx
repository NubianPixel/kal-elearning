import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { cardShadow, useTheme, type ThemeColors } from '../theme';

const TITLE = 'KAL-learning';
const TAGLINE = 'Back to Basics';

/**
 * Animated splash overlay.
 *
 * Timeline (≈2.6s):
 *  1. Ripple rings pulse behind a rounded badge that springs in
 *  2. "KAL-elearning" reveals letter-by-letter
 *  3. Divider grows, "Back to Basics" tagline fades in
 *  4. Brief hold, then the whole overlay fades out and calls onDone
 *
 * Built purely on the built-in Animated API (no extra dependencies) and
 * fully theme-aware, so it matches whichever palette the parent picked.
 */
export default function SplashScreen({ onDone }: { onDone: () => void }) {
  const { colors: c } = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);

  const overlay = useRef(new Animated.Value(1)).current;
  const iconScale = useRef(new Animated.Value(0)).current;
  const line = useRef(new Animated.Value(0)).current;
    const tagOpacity = useRef(new Animated.Value(0)).current;
  const ripple1 = useRef(new Animated.Value(0)).current;
  const ripple2 = useRef(new Animated.Value(0)).current;
  /** One opacity/offset pair per letter of the title. */
  const letters = useRef(
    TITLE.split('').map(() => ({
      opacity: new Animated.Value(0),
      y: new Animated.Value(14),
    })),
  ).current;

  useEffect(() => {
    const rippleLoop = (value: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(value, {
            toValue: 1,
            duration: 2000,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      );

    const letterAnims = letters.flatMap((l, i) => [
      Animated.timing(l.opacity, {
        toValue: 1,
        duration: 350,
        delay: 250 + i * 45,
        useNativeDriver: true,
      }),
      Animated.timing(l.y, {
        toValue: 0,
        duration: 350,
        delay: 250 + i * 45,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]);

    const intro = Animated.parallel([
      Animated.spring(iconScale, {
        toValue: 1,
        friction: 5,
        tension: 70,
        useNativeDriver: true,
      }),
      Animated.stagger(22, letterAnims),
      Animated.timing(line, {
        toValue: 1,
        duration: 500,
        delay: 250 + TITLE.length * 45 + 150,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
            Animated.timing(tagOpacity, {
        toValue: 1,
        duration: 550,
        delay: 250 + TITLE.length * 45 + 350,
        useNativeDriver: true,
      }),
    ]);

    // Ripple loops never "finish", so they run beside the main timeline.
    const loops = Animated.parallel([
      rippleLoop(ripple1, 0),
      rippleLoop(ripple2, 1000),
    ]);
    const timeline = Animated.sequence([
      intro,
      Animated.timing(overlay, {
        toValue: 0,
        duration: 450,
        delay: 500,
        useNativeDriver: true,
      }),
    ]);

    loops.start();
    timeline.start(({ finished }) => {
      if (finished) onDone();
    });
    return () => {
      timeline.stop();
      loops.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Animated.View style={[styles.fill, { opacity: overlay }]}>
      <View style={[styles.fill, styles.background]} />

      {/* Pulsing ripples behind the badge */}
      <View style={styles.rippleWrap} pointerEvents="none">
        {[ripple1, ripple2].map((v, i) => (
          <Animated.View
            key={i}
            style={[
              styles.ripple,
              {
                transform: [
                  { scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 2.3] }) },
                ],
                opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0] }),
              },
            ]}
          />
        ))}

        {/* Icon badge */}
        <Animated.View
          style={[
            styles.badge,
            {
              transform: [{ scale: iconScale }],
            },
          ]}
        >
          <Ionicons name="book" size={44} color={c.onDark} />
        </Animated.View>
      </View>

      {/* Letter-by-letter title */}
      <View style={styles.titleRow}>
        {TITLE.split('').map((ch, i) => (
          <Animated.Text
            key={i}
            style={[
              styles.title,
              i < 3 ? styles.titleCap : ch === '-' ? styles.titleDash : null,
              {
                opacity: letters[i].opacity,
                transform: [{ translateY: letters[i].y }],
              },
            ]}
          >
            {ch}
          </Animated.Text>
        ))}
      </View>

      {/* Growing divider */}
      <Animated.View style={[styles.divider, { transform: [{ scaleX: line }] }]} />

      {/* Tagline */}
            <Animated.Text
        style={[styles.tagline, { opacity: tagOpacity }]}
      >
        {TAGLINE}
      </Animated.Text>
    </Animated.View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    fill: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 100,
      elevation: 100,
    },
    background: {
      backgroundColor: c.background,
      zIndex: -1,
    },
    rippleWrap: {
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 22,
    },
    ripple: {
      position: 'absolute',
      width: 116,
      height: 116,
      borderRadius: 58,
      backgroundColor: c.primarySoft,
    },
    badge: {
      width: 108,
      height: 108,
      borderRadius: 34,
      backgroundColor: c.primary,
      alignItems: 'center',
      justifyContent: 'center',
      ...cardShadow(c, 'lg'),
    },
    titleRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
    },
    title: {
      fontSize: 32,
      fontWeight: '800',
      color: c.text,
    },
    titleCap: {
      color: c.primaryDeep,
    },
    titleDash: {
      color: c.muted,
      fontWeight: '400',
    },
    divider: {
      width: 120,
      height: 3,
      borderRadius: 2,
      backgroundColor: c.primary,
      marginTop: 14,
    },
        tagline: {
      marginTop: 10,
      fontSize: 15,
      fontWeight: '600',
      color: c.muted,
      textTransform: 'uppercase',
      letterSpacing: 3,
    },
  });


