import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import type { ReactNode } from 'react';

export function Button({
  label,
  onPress,
  loading = false,
  disabled = false,
  variant = 'primary',
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'ghost';
}) {
  const base = 'rounded-2xl py-4 px-5 items-center justify-center flex-row';
  const styles =
    variant === 'primary'
      ? 'bg-brand'
      : variant === 'secondary'
        ? 'bg-white border border-gray-300'
        : 'bg-transparent';
  const text = variant === 'primary' ? 'text-white' : 'text-ink';
  const isOff = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={isOff}
      className={`${base} ${styles} ${isOff ? 'opacity-50' : 'active:opacity-80'}`}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? '#fff' : '#0ABFA3'} />
      ) : (
        <Text className={`text-base font-semibold ${text}`}>{label}</Text>
      )}
    </Pressable>
  );
}

export function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`px-4 py-2 rounded-full border mr-2 mb-2 ${
        selected ? 'bg-brand border-brand' : 'bg-white border-gray-300'
      }`}
    >
      <Text className={`text-sm font-medium ${selected ? 'text-white' : 'text-ink'}`}>{label}</Text>
    </Pressable>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <View className={`bg-white rounded-2xl p-4 border border-gray-100 ${className}`}>{children}</View>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <Text className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">{children}</Text>;
}
