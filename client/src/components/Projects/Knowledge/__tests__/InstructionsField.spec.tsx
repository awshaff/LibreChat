import '@testing-library/jest-dom/extend-expect';
import userEvent from '@testing-library/user-event';
import { render, screen } from '@testing-library/react';
import type { TChatProject } from 'librechat-data-provider';
import InstructionsField from '../InstructionsField';

const mockMutate = jest.fn();

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('~/data-provider', () => ({
  useUpdateProjectMutation: () => ({ mutate: mockMutate }),
}));

const project = (overrides: Partial<TChatProject> = {}): TChatProject =>
  ({
    _id: 'project-1',
    name: 'Test Project',
    instructions: '',
    conversationCount: 0,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  }) as TChatProject;

beforeEach(() => {
  mockMutate.mockClear();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('InstructionsField', () => {
  it('renders the project’s existing instructions', () => {
    render(<InstructionsField project={project({ instructions: 'Be concise.' })} />);
    expect(screen.getByDisplayValue('Be concise.')).toBeInTheDocument();
  });

  it('debounces saves instead of firing on every keystroke', async () => {
    const user = userEvent.setup({ delay: null });
    render(<InstructionsField project={project()} />);

    await user.type(screen.getByRole('textbox'), 'Hi');

    expect(mockMutate).not.toHaveBeenCalled();

    jest.advanceTimersByTime(600);

    expect(mockMutate).toHaveBeenCalledTimes(1);
    expect(mockMutate).toHaveBeenCalledWith({ projectId: 'project-1', instructions: 'Hi' });
  });

  it('flushes the pending save on unmount instead of dropping it', async () => {
    const user = userEvent.setup({ delay: null });
    const { unmount } = render(<InstructionsField project={project()} />);

    await user.type(screen.getByRole('textbox'), 'Hi');
    expect(mockMutate).not.toHaveBeenCalled();

    unmount();

    expect(mockMutate).toHaveBeenCalledTimes(1);
    expect(mockMutate).toHaveBeenCalledWith({ projectId: 'project-1', instructions: 'Hi' });
  });

  it('resets the field when a different project is passed in', () => {
    const { rerender } = render(<InstructionsField project={project({ instructions: 'First' })} />);
    expect(screen.getByDisplayValue('First')).toBeInTheDocument();

    rerender(<InstructionsField project={project({ _id: 'project-2', instructions: 'Second' })} />);
    expect(screen.getByDisplayValue('Second')).toBeInTheDocument();
  });
});
