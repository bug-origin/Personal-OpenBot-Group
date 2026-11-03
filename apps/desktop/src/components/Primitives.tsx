import { Button, Modal, Input, Label, TextField, TextArea } from '@heroui/react';
import { Bot as BotIcon, Command, X } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Bot } from '@openbot/shared';
import { statusLabel } from '@openbot/shared';
export function IconButton({
  children,
  label,
  onPress,
  className = '',
}: {
  children: ReactNode;
  label: string;
  onPress?: () => void;
  className?: string;
}) {
  return (
    <Button
      isIconOnly
      variant="ghost"
      size="sm"
      aria-label={label}
      onPress={onPress}
      className={`icon-button ${className}`}
    >
      {children}
    </Button>
  );
}
export function BotAvatar({
  bot,
  size = 'normal',
}: {
  bot?: Pick<Bot, 'provider' | 'status' | 'name'>;
  size?: 'normal' | 'large' | 'small';
}) {
  const tone = bot?.name
    ? Array.from(bot.name).reduce((hash, char) => (hash * 31 + char.codePointAt(0)!) >>> 0, 0) % 5
    : null;
  return (
    <span
      className={`bot-avatar ${tone === null ? '' : `avatar-tone-${tone}`} ${bot?.provider ?? 'generic'} ${size}`}
    >
      <BotIcon size={size === 'large' ? 26 : size === 'small' ? 15 : 19} />
      {bot && <i className={`presence ${bot.status}`} />}
    </span>
  );
}
export function Status({ status }: { status: Bot['status'] }) {
  return (
    <span className={`status-label ${status}`}>
      <i />
      {statusLabel[status]}
    </span>
  );
}
export function Dialog({
  open,
  onClose,
  title,
  subtitle,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <Modal
      isOpen={open}
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
    >
      <Modal.Backdrop variant="blur">
        <Modal.Container>
          <Modal.Dialog className={`app-dialog ${wide ? 'wide' : ''}`}>
            <Modal.Header>
              <div className="dialog-heading">
                <Modal.Heading>{title}</Modal.Heading>
                <IconButton label="关闭" onPress={onClose}>
                  <X size={18} />
                </IconButton>
              </div>
              {subtitle && <p className="dialog-subtitle">{subtitle}</p>}
            </Modal.Header>
            <Modal.Body>{children}</Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
export function Field({
  label,
  value,
  onChange,
  placeholder,
  multiline = false,
  type = 'text',
  required = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  type?: string;
  required?: boolean;
}) {
  return (
    <TextField className="form-field" value={value} onChange={onChange} isRequired={required}>
      <Label>{label}</Label>
      {multiline ? (
        <TextArea placeholder={placeholder} rows={3} />
      ) : (
        <Input type={type} placeholder={placeholder} />
      )}
    </TextField>
  );
}
export function Shortcut() {
  return (
    <span className="shortcut">
      <Command size={11} /> K
    </span>
  );
}
export function EmptySmall({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="empty-small">
      <span>{icon}</span>
      <p>{title}</p>
      <small>{description}</small>
    </div>
  );
}
