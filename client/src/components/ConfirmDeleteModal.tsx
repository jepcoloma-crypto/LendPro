import { Modal, Button, toaster, Message } from 'rsuite';

interface ConfirmDeleteModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  title?: string;
  message?: string;
  name?: string;
  identifier?: string;
}

export const ConfirmDeleteModal = ({ open, onClose, onConfirm, title = 'Confirm Delete', message, name, identifier }: ConfirmDeleteModalProps) => {
  const handleDelete = async () => {
    try {
      await onConfirm();
      toaster.push(<Message type="success">Deleted successfully</Message>, { placement: 'topEnd' });
      onClose();
    } catch { toaster.push(<Message type="error">Failed to delete</Message>, { placement: 'topEnd' }); }
  };

  return (
    <Modal open={open} onClose={onClose} size="xs">
      <Modal.Header><Modal.Title>{title}</Modal.Title></Modal.Header>
      <Modal.Body>
        {message ? (
          <p className="text-gray-600 dark:text-gray-300">{message}</p>
        ) : (
          <p className="text-gray-600 dark:text-gray-300">
            Are you sure you want to delete{name ? <strong> {name}</strong> : ''}{identifier ? ` (${identifier})` : ''}? This action cannot be undone.
          </p>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button color="red" appearance="primary" onClick={handleDelete}>Delete</Button>
        <Button appearance="subtle" onClick={onClose}>Cancel</Button>
      </Modal.Footer>
    </Modal>
  );
};
