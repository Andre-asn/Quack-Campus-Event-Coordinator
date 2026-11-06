import { Easing } from 'react-native';
import { Easing as ReanimatedEasing, cubicBezier } from 'react-native-reanimated';

// Tokens from the Quack! Figma redesign.
export const colors = {
  red: '#A32638',
  cream: '#FCF4E5',
  ink: '#1E1A1D',
  inkSoft: '#3A3336',
  muted: '#5C5457',
  line: '#D8CFC4',
  errorLine: '#E9C9CF',
  white: '#FFFFFF',
  yellow: '#F5C243',
  paper: '#FFFDF9',
  sand: '#F2EDE4',
  inputLine: '#CFC6BC',
  redTint: '#F7DDE2',
  redDeep: '#7A1528',
  divider: '#ECE5DC',
  avatar: '#3D5A80',
};

// Bricolage Grotesque is loaded in App.tsx. Body text uses the platform font.
export const fonts = {
  displayExtraBold: 'BricolageGrotesque_800ExtraBold',
  displayBold: 'BricolageGrotesque_700Bold',
  displaySemiBold: 'BricolageGrotesque_600SemiBold',
};

// For core Animated (sign-in, loading). Reanimated runs on the UI thread and can't call this one.
export const easeOut = Easing.bezier(0.23, 1, 0.32, 1);

// The same curves for Reanimated: worklet easing for withTiming and layout animations,
// and CSS easing for Reanimated CSS transitions.
export const sheetEaseOut = ReanimatedEasing.bezier(0.23, 1, 0.32, 1);
export const cssEaseOut = cubicBezier(0.23, 1, 0.32, 1);
export const cssEaseInOut = cubicBezier(0.77, 0, 0.175, 1);
