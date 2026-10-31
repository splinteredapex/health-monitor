import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Dexie from 'dexie';
import { db, DB_NAME } from '../db/db';
import { ToastProvider } from '../ui/primitives';
import { Onboarding } from './Onboarding';

beforeEach(async () => { db.close(); await Dexie.delete(DB_NAME); await db.open(); });

describe('Onboarding', () => {
  it('requires acknowledgement, validates inputs accessibly and seeds the programme', async () => {
    const user = userEvent.setup();
    render(<ToastProvider><Onboarding /></ToastProvider>);
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Please confirm');
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    const height = screen.getByLabelText('Height');
    await user.clear(height);
    await user.type(height, '20');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(height).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Height must be 100–250 cm.')).toBeInTheDocument();
    await user.clear(height);
    await user.type(height, '178');
    await user.type(screen.getByLabelText('Baseline weight'), '80');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: 'Start my programme' }));
    await vi.waitFor(async () => expect(await db.userProfile.get('profile')).toBeTruthy());
    expect(await db.programmeWeeks.count()).toBe(13);
  });
});
