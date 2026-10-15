import { Easing } from 'react-native';

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
};

// Bricolage Grotesque is loaded in App.tsx. Body text uses the platform font.
export const fonts = {
  displayExtraBold: 'BricolageGrotesque_800ExtraBold',
  displayBold: 'BricolageGrotesque_700Bold',
  displaySemiBold: 'BricolageGrotesque_600SemiBold',
};

export const easeOut = Easing.bezier(0.23, 1, 0.32, 1);
