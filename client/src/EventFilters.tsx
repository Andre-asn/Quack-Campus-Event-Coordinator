import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  cubicBezier,
  Easing,
  FadeIn,
  FadeOut,
  LinearTransition,
  useReducedMotion,
} from 'react-native-reanimated';

import CheckIcon from '../assets/create/check.svg';
import {
  categories,
  categoryLabel,
  isFiltering,
  noFilter,
  timeWindowAccessibilityLabels,
  timeWindowLabels,
  timeWindows,
  type Category,
  type EventFilter,
} from './listFilters';
import { colors } from './theme';

// Strong ease-out for state changes, ease-in-out for the pill moving across the track.
const EASE_OUT = cubicBezier(0.23, 1, 0.32, 1);
const EASE_IN_OUT = cubicBezier(0.77, 0, 0.175, 1);
// Layout animations take a worklet easing rather than a CSS one; same curve.
const LAYOUT_EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
// Filters change tens of times a session, so motion stays near-imperceptible.
const STATE_MS = 140;
const PILL_MS = 150;
const TRACK_PADDING = 3;

type Props = {
  filter: EventFilter;
  onChange: (filter: EventFilter) => void;
  // Events left after filtering, and in the viewport.
  matching: number;
  total: number;
};

// Start time is one-of-four, so it's a segmented control; categories are any-of-seven, so they're
// wrapping chips like the create sheet. The count line confirms each tap.
export default function EventFilters({ filter, onChange, matching, total }: Props) {
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
      <TimeSegments onChange={(time) => onChange({ ...filter, time })} value={filter.time} />
      <View accessibilityLabel="Categories" style={styles.chips}>
        {categories.map((category) => (
          <Chip
            key={category}
            label={categoryLabel(category)}
            onPress={() => toggle(category)}
            selected={filter.categories.includes(category)}
          />
        ))}
      </View>
      {isFiltering(filter) ? (
        <Animated.View
          entering={FadeIn.duration(STATE_MS)}
          exiting={FadeOut.duration(100)}
          style={styles.summary}
        >
          <Text accessibilityLiveRegion="polite" style={styles.summaryText}>
            {matching} of {total} {total === 1 ? 'event' : 'events'}
          </Text>
          <Pressable
            accessibilityLabel="Clear filters"
            accessibilityRole="button"
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            onPress={() => onChange(noFilter)}
          >
            {({ pressed }) => <Text style={[styles.clearText, pressed && styles.clearPressed]}>Clear</Text>}
          </Pressable>
        </Animated.View>
      ) : null}
    </View>
  );
}

function TimeSegments({ value, onChange }: { value: EventFilter['time']; onChange: (time: EventFilter['time']) => void }) {
  const reduced = useReducedMotion();
  const [trackWidth, setTrackWidth] = useState(0);
  const segmentWidth = trackWidth > 0 ? (trackWidth - TRACK_PADDING * 2) / timeWindows.length : 0;
  const index = timeWindows.indexOf(value);

  return (
    <View
      accessibilityLabel="Start time"
      accessibilityRole="radiogroup"
      onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
      style={styles.track}
    >
      {segmentWidth > 0 ? (
        // Absolute and childless, so moving it never re-lays-out the labels. Reduce Motion drops the slide.
        <Animated.View
          pointerEvents="none"
          style={[
            styles.pill,
            {
              width: segmentWidth,
              transform: [{ translateX: TRACK_PADDING + index * segmentWidth }],
              transitionProperty: 'transform',
              transitionDuration: reduced ? 0 : PILL_MS,
              transitionTimingFunction: EASE_IN_OUT,
            },
          ]}
        />
      ) : null}
      {timeWindows.map((window) => {
        const selected = window === value;
        return (
          <Pressable
            accessibilityLabel={timeWindowAccessibilityLabels[window]}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            key={window}
            onPress={() => onChange(window)}
            style={styles.segment}
          >
            {({ pressed }) => (
              <Animated.Text
                numberOfLines={1}
                style={[
                  styles.segmentText,
                  {
                    color: selected ? colors.ink : colors.muted,
                    opacity: pressed && !selected ? 0.6 : 1,
                    transitionProperty: ['color', 'opacity'],
                    transitionDuration: STATE_MS,
                    transitionTimingFunction: EASE_OUT,
                  },
                ]}
              >
                {timeWindowLabels[window]}
              </Animated.Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    // The check icon widens a selected chip, so neighbours glide to their new place instead of jumping.
    <Animated.View layout={LinearTransition.duration(STATE_MS).easing(LAYOUT_EASE_OUT)}>
      <Pressable
        accessibilityLabel={label}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: selected }}
        onPress={onPress}
      >
        {({ pressed }) => (
          <Animated.View
            style={[
              styles.chip,
              {
                // White matches the list sheet, so unselected chips read as outlines.
                backgroundColor: selected ? colors.redTint : colors.white,
                borderColor: selected ? colors.redTint : colors.line,
                transform: [{ scale: pressed ? 0.97 : 1 }],
                transitionProperty: ['backgroundColor', 'borderColor', 'transform'],
                transitionDuration: STATE_MS,
                transitionTimingFunction: EASE_OUT,
              },
            ]}
          >
            {selected ? (
              <Animated.View entering={FadeIn.duration(STATE_MS)}>
                <CheckIcon height={18} width={18} />
              </Animated.View>
            ) : null}
            <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
          </Animated.View>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  filters: {
    gap: 12,
    marginBottom: 8,
  },
  track: {
    backgroundColor: colors.sand,
    borderRadius: 12,
    flexDirection: 'row',
    padding: TRACK_PADDING,
  },
  pill: {
    backgroundColor: colors.white,
    borderRadius: 9,
    bottom: TRACK_PADDING,
    elevation: 1,
    left: 0,
    position: 'absolute',
    shadowColor: '#1F0F14',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    top: TRACK_PADDING,
  },
  // 38 + the track's 6 = a 44pt target.
  segment: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    minHeight: 38,
    paddingHorizontal: 4,
  },
  segmentText: {
    fontSize: 14,
    fontWeight: '600',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    minHeight: 36,
    paddingHorizontal: 12,
  },
  chipText: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '500',
  },
  chipTextSelected: {
    color: colors.redDeep,
  },
  summary: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  summaryText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '500',
  },
  clearText: {
    color: colors.red,
    fontSize: 14,
    fontWeight: '600',
  },
  clearPressed: {
    opacity: 0.6,
  },
});
