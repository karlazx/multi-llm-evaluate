import { useEffect, type ReactNode } from 'react';

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        {children}
      </div>
    </div>
  );
}

/** 替代 window.confirm 的确认弹窗 */
export function ConfirmDialog({
  title, message, confirmText = '确认', danger = false, onConfirm, onCancel,
}: {
  title: string; message: string; confirmText?: string; danger?: boolean;
  onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <Modal title={title} onClose={onCancel}>
      <p>{message}</p>
      <div className="btn-row">
        <button className="btn ghost" onClick={onCancel}>取消</button>
        <button className={danger ? 'btn danger' : 'btn primary'} onClick={onConfirm}>{confirmText}</button>
      </div>
    </Modal>
  );
}
