import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { cardShadow, useTheme, type ThemeColors } from '../../../theme';

interface Props {
  options: string[];
  /** Index the learner picked, or null before an answer is chosen. */
  selected: number | null;
  /** True once an answer has been chosen — locks input, reveals right/wrong. */
  answered: boolean;
  correctAnswer: string;
  onSelect: (index: number) => void;
}

/** A grid of tappable answer options — shared by listening, drill, grammar and reading questions. */
export default function ChoiceOptions({ options, selected, answered, correctAnswer, onSelect }: Props) {
  const { colors: c } = useTheme();
  const styles = makeStyles(c);

  return (
    <View style={styles.grid}>
      {options.map((opt, i) => {
        const isCorrect = opt === correctAnswer;
        const style = !answered
          ? styles.idle
          : isCorrect
            ? styles.correct
            : i === selected
              ? styles.wrong
              : styles.dim;
        return (
          <Pressable
            key={`${opt}-${i}`}
            style={[styles.option, style]}
            onPress={() => !answered && onSelect(i)}
            disabled={answered}
            accessibilityRole="button"
            accessibilityLabel={opt}
          >
            <Text style={styles.text}>{opt}</Text>
            {answered && isCorrect && (
              <View style={[styles.badge, styles.badgeCorrect]}>
                <Ionicons name="checkmark" size={16} color="#FFFFFF" />
              </View>
            )}
            {answered && i === selected && !isCorrect && (
              <View style={[styles.badge, styles.badgeWrong]}>
                <Ionicons name="close" size={16} color="#FFFFFF" />
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
    option: {
      width: '48.5%',
      minHeight: 56,
      borderRadius: 18,
      borderWidth: 3,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 12,
      marginBottom: 10,
      ...cardShadow(c, 'sm'),
    },
    idle: { borderColor: c.primarySoft, backgroundColor: c.card },
    correct: { borderColor: c.correct, backgroundColor: c.primarySoft },
    wrong: { borderColor: c.wrong, backgroundColor: c.wrongSoft },
    dim: { borderColor: c.primarySoft, backgroundColor: c.card, opacity: 0.45 },
    text: { fontSize: 16, fontWeight: '700', color: c.text, textAlign: 'center' },
    badge: {
      position: 'absolute',
      top: -8,
      right: -8,
      width: 24,
      height: 24,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: c.card,
    },
    badgeCorrect: { backgroundColor: c.correct },
    badgeWrong: { backgroundColor: c.wrong },
  });
