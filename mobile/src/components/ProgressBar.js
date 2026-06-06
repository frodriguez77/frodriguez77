import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';
import colors from '../theme/colors';

export default function ProgressBar({ progress = 0, label, sublabel, color = colors.primary }) {
  const animatedWidth = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(animatedWidth, {
      toValue: Math.min(Math.max(progress, 0), 1),
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [progress]);

  const percent = Math.round(progress * 100);

  return (
    <View style={styles.container}>
      {label ? (
        <View style={styles.labelRow}>
          <Text style={styles.label} numberOfLines={1}>{label}</Text>
          <Text style={[styles.percent, { color }]}>{percent}%</Text>
        </View>
      ) : null}

      <View style={styles.track}>
        <Animated.View
          style={[
            styles.fill,
            {
              backgroundColor: color,
              width: animatedWidth.interpolate({
                inputRange: [0, 1],
                outputRange: ['0%', '100%'],
              }),
            },
          ]}
        />
      </View>

      {sublabel ? (
        <Text style={styles.sublabel} numberOfLines={1}>{sublabel}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
    marginRight: 8,
  },
  percent: {
    fontSize: 13,
    fontWeight: '700',
  },
  track: {
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 5,
  },
  sublabel: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 4,
  },
});
