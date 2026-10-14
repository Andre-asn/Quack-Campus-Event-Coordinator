declare const process: {
  env: {
    EXPO_PUBLIC_API_BASE_URL?: string;
  };
};

const configured = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:8080';

export const apiBaseUrl = configured.replace(/\/$/, '');

export const sessionCookieName = 'JSESSIONID';
