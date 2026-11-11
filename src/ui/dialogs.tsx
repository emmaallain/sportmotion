import type { ReactNode } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';

import { t } from '@/i18n';

import { Button } from './components';
import { colors, font, radius, spacing } from './theme';

/** In-app dialog (React Native's Alert does nothing on the web). */
export function Dialog({
  visible,
  title,
  children,
  onClose,
  actions,
}: {
  visible: boolean;
  title: string;
  children?: ReactNode;
  onClose: () => void;
  actions?: ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.dialog} accessibilityViewIsModal>
          <Text accessibilityRole="header" style={styles.title}>
            {title}
          </Text>
          {children}
          <View style={styles.actions}>{actions}</View>
        </View>
      </View>
    </Modal>
  );
}

export function ConfirmDialog({
  visible,
  title,
  body,
  confirmLabel = t.common.confirm,
  danger = false,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  title: string;
  body: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog
      visible={visible}
      title={title}
      onClose={onCancel}
      actions={
        <>
          <Button
            label={t.common.cancel}
            variant="secondary"
            onPress={onCancel}
            style={styles.flex}
            testID="confirm-cancel"
          />
          <Button
            label={confirmLabel}
            variant={danger ? 'danger' : 'primary'}
            onPress={onConfirm}
            style={styles.flex}
            testID="confirm-ok"
          />
        </>
      }
    >
      <Text style={styles.body}>{body}</Text>
    </Dialog>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  dialog: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    gap: spacing.md,
    width: '100%',
    maxWidth: 420,
  },
  title: { fontSize: font.title, fontWeight: '800', color: colors.text },
  body: { fontSize: font.label, color: colors.textMuted, lineHeight: 22 },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
});
