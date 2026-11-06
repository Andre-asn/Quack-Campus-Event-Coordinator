import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import CheckIcon from '../assets/create/check.svg';
import {
  categories,
  categoryLabel,
  timeWindowLabels,
  timeWindows,
  type Category,
  type EventFilter,
} from './listFilters';
import { colors } from './theme';

type Props = {
  filter: EventFilter;
  onChange: (filter: EventFilter) => void;
};

// Two chip rows above the events list: one start-time window, any number of categories.
// Styled like the category chips on the create sheet.
export default function EventFilters({ filter, onChange }: Props) {
  function toggle(category: Category) {
    const selected = filter.categories.includes(category);
    onChange({
      ...filter,
      categories: selected
        ? filter.categories.filter((value) => value !== category)
        : [...filter.categories, category],
    });
  }

  return (
    <View style={styles.filters}>
      <ScrollView
        accessibilityLabel="Start time"
        accessibilityRole="radiogroup"
        contentContainerStyle={styles.row}
        horizontal
        showsHorizontalScrollIndicator={false}
      >
        {timeWindows.map((window) => (
          <Chip
            key={window}
            label={timeWindowLabels[window]}
            onPress={() => onChange({ ...filter, time: window })}
            role="radio"
            selected={filter.time === window}
          />
        ))}
      </ScrollView>
      <ScrollView
        accessibilityLabel="Categories"
        contentContainerStyle={styles.row}
        horizontal
        showsHorizontalScrollIndicator={false}
      >
        {categories.map((category) => (
          <Chip
            key={category}
            label={categoryLabel(category)}
            onPress={() => toggle(category)}
            role="checkbox"
            selected={filter.categories.includes(category)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

function Chip({
  label,
  selected,
  role,
  onPress,
}: {
  label: string;
  selected: boolean;
  role: 'radio' | 'checkbox';
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole={role}
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, selected && styles.chipSelected, pressed && styles.pressed]}
    >
      {selected ? <CheckIcon height={18} width={18} /> : null}
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  filters: {
    gap: 8,
    marginBottom: 8,
  },
  row: {
    gap: 8,
  },
  chip: {
    alignItems: 'center',
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    minHeight: 36,
    paddingHorizontal: 12,
  },
  chipSelected: {
    backgroundColor: colors.redTint,
    borderColor: colors.redTint,
    paddingLeft: 8,
  },
  chipText: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '500',
  },
  chipTextSelected: {
    color: colors.redDeep,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
});
