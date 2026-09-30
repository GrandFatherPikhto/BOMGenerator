// The import dialog: target board selection and the renamed-file guard.
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import ImportDialog from '../../src/client/components/ImportDialog.jsx';

const BOARDS = [
  { id: 'b1', name: 'Board A', sourceFile: 'Board-A-v1.csv', isService: false },
  { id: 'svc', name: 'Докупить', sourceFile: null, isService: true },
];

function renderDialog(props = {}) {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  const onClose = vi.fn();
  const utils = render(
    <ImportDialog
      open
      onClose={onClose}
      onSubmit={onSubmit}
      boards={BOARDS}
      {...props}
    />,
  );
  return { onSubmit, onClose, ...utils };
}

function chooseFile(fileName) {
  // The dialog renders into a portal attached to document.body, so the hidden
  // file input is not inside the render container.
  const input = document.querySelector('input[type="file"]');
  fireEvent.change(input, {
    target: { files: [new File(['Reference,Qty,Value,Footprint'], fileName)] },
  });
}

function selectBoard(name) {
  fireEvent.mouseDown(screen.getByRole('combobox', { name: /Куда импортировать/ }));
  fireEvent.click(screen.getByRole('option', { name }));
}

describe('ImportDialog', () => {
  it('creates a new board by default and shows the name field', () => {
    renderDialog();
    expect(screen.getByLabelText('Имя платы')).toBeInTheDocument();
    expect(screen.queryByText(/Сохранённое имя файла/)).not.toBeInTheDocument();
  });

  it('shows the stored file name and hides the name field for a target board', () => {
    renderDialog();
    selectBoard('Board A');

    expect(
      screen.getByText(/Сохранённое имя файла: Board-A-v1\.csv/),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Имя платы')).not.toBeInTheDocument();
  });

  it('blocks a renamed import until the new name is confirmed', () => {
    const { onSubmit } = renderDialog();
    selectBoard('Board A');
    chooseFile('Board-A-v2.csv');

    expect(screen.getByText(/не совпадает с сохранённым/)).toBeInTheDocument();
    const submit = screen.getByRole('button', { name: 'Импортировать' });
    expect(submit).toBeDisabled();

    fireEvent.click(
      screen.getByLabelText('Запомнить новое имя файла и обновить эту плату'),
    );
    expect(submit).toBeEnabled();

    fireEvent.click(submit);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const payload = onSubmit.mock.calls[0][0];
    expect(payload.targetBoardId).toBe('b1');
    expect(payload.renameSourceFile).toBe(true);
  });

  it('imports into a matching board without a warning', () => {
    const { onSubmit } = renderDialog();
    selectBoard('Board A');
    chooseFile('Board-A-v1.csv');

    expect(screen.queryByText(/не совпадает с сохранённым/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Импортировать' }));

    const payload = onSubmit.mock.calls[0][0];
    expect(payload.targetBoardId).toBe('b1');
    expect(payload.renameSourceFile).toBeUndefined();
  });

  it('warns when a new board import reuses an existing file name', () => {
    const { onSubmit } = renderDialog();
    chooseFile('Board-A-v1.csv');

    expect(screen.getByText(/уже импортирован в плату «Board A»/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Импортировать' }));

    const payload = onSubmit.mock.calls[0][0];
    expect(payload.targetBoardId).toBeUndefined();
  });
});
