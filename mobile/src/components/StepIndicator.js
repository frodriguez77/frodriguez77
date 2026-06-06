import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import colors from '../theme/colors';

export default function StepIndicator({ currentStep, steps }) {
  return (
    <View style={styles.container}>
      {steps.map((label, index) => {
        const step = index + 1;
        const isCompleted = step < currentStep;
        const isCurrent = step === currentStep;

        return (
          <React.Fragment key={step}>
            <View style={styles.stepItem}>
              <View
                style={[
                  styles.circle,
                  isCompleted && styles.circleCompleted,
                  isCurrent && styles.circleCurrent,
                ]}
              >
                {isCompleted ? (
                  <MaterialIcons name="check" size={14} color="#fff" />
                ) : (
                  <Text style={[styles.stepNumber, isCurrent && styles.stepNumberCurrent]}>
                    {step}
                  </Text>
                )}
              </View>
              <Text
                style={[
                  styles.label,
                  isCurrent && styles.labelCurrent,
                  isCompleted && styles.labelCompleted,
                ]}
                numberOfLines={1}
              >
                {label}
              </Text>
            </View>

            {index < steps.length - 1 && (
              <View style={[styles.line, isCompleted && styles.lineCompleted]} />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  stepItem: {
    alignItems: 'center',
    flex: 1,
  },
  circle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  circleCompleted: {
    backgroundColor: colors.success,
  },
  circleCurrent: {
    backgroundColor: colors.primary,
  },
  stepNumber: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  stepNumberCurrent: {
    color: '#fff',
  },
  label: {
    fontSize: 10,
    color: colors.textSecondary,
    textAlign: 'center',
    fontWeight: '500',
  },
  labelCurrent: {
    color: colors.primary,
    fontWeight: '700',
  },
  labelCompleted: {
    color: colors.success,
  },
  line: {
    height: 2,
    flex: 0.5,
    backgroundColor: colors.border,
    marginTop: 13,
    alignSelf: 'flex-start',
  },
  lineCompleted: {
    backgroundColor: colors.success,
  },
});
