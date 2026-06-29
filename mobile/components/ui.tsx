import { ActivityIndicator, Modal, Pressable, Text, View } from 'react-native';
import type { ReactNode } from 'react';

/**
 * Branded dialog. Pass `confirmLabel` for a two-button confirm (Cancel + action);
 * omit it for a single-button info dialog.
 */
export function AppModal({
  visible,
  title,
  message,
  onClose,
  confirmLabel,
  onConfirm,
  destructive = false,
  cancelLabel = 'Cancel',
}: {
  visible: boolean;
  title: string;
  message?: string;
  onClose: () => void;
  confirmLabel?: string;
  onConfirm?: () => void;
  destructive?: boolean;
  cancelLabel?: string;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center px-8" style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}>
        <View className="w-full rounded-3xl p-6" style={{ backgroundColor: '#fff', maxWidth: 360 }}>
          <Text className="text-lg font-bold text-ink mb-1">{title}</Text>
          {message ? <Text className="text-muted leading-5 mb-5">{message}</Text> : <View className="mb-4" />}
          <View className="flex-row gap-3">
            {confirmLabel ? (
              <>
                <Pressable
                  onPress={onClose}
                  className="flex-1 items-center justify-center rounded-xl py-3"
                  style={{ backgroundColor: '#F4F4F5' }}
                >
                  <Text className="font-semibold text-ink">{cancelLabel}</Text>
                </Pressable>
                <Pressable
                  onPress={onConfirm}
                  className="flex-1 items-center justify-center rounded-xl py-3"
                  style={{ backgroundColor: destructive ? '#EF4444' : '#1C1A16' }}
                >
                  <Text className="font-semibold text-white">{confirmLabel}</Text>
                </Pressable>
              </>
            ) : (
              <Pressable
                onPress={onClose}
                className="flex-1 items-center justify-center rounded-xl py-3"
                style={{ backgroundColor: '#1C1A16' }}
              >
                <Text className="font-semibold text-white">OK</Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

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
        ? 'bg-white border border-line'
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
        <ActivityIndicator color={variant === 'primary' ? '#fff' : '#1C1A16'} />
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
        selected ? 'bg-brand border-brand' : 'bg-white border-line'
      }`}
    >
      <Text className={`text-sm font-medium ${selected ? 'text-white' : 'text-ink'}`}>{label}</Text>
    </Pressable>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <View className={`bg-white rounded-2xl p-4 border border-line ${className}`}>{children}</View>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <Text className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">{children}</Text>;
}
