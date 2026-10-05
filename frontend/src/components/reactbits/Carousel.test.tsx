import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Carousel from './Carousel';

const items = ['Delivery metrics', 'Pull request explorer', 'Contributors'].map((title, i) => ({
  id: i + 1,
  title,
  description: `${title} description`,
  icon: <span />,
}));

describe('Carousel (React Bits, adapted)', () => {
  it('is a labelled carousel with one slide per item', () => {
    render(<Carousel label="Features" items={items} />);
    expect(screen.getByRole('region', { name: 'Features' })).toHaveAttribute('aria-roledescription', 'carousel');
    // Off-screen slides are hidden from assistive tech; only the current one is exposed
    expect(screen.getAllByRole('group').map((g) => g.getAttribute('aria-label'))).toEqual(['1 of 3']);
    expect(screen.getAllByRole('group', { hidden: true }).map((g) => g.getAttribute('aria-label'))).toEqual(['1 of 3', '2 of 3', '3 of 3']);
    expect(screen.getByText('1 / 3')).toBeInTheDocument();
  });

  it('moves with the next/previous buttons, the dots and the arrow keys', async () => {
    render(<Carousel label="Features" items={items} />);
    await userEvent.click(screen.getByRole('button', { name: 'Next feature' }));
    expect(screen.getByText('2 / 3')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Go to Contributors (3 of 3)' }));
    expect(screen.getByText('3 / 3')).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('region', { name: 'Features' }), { key: 'ArrowLeft' });
    expect(screen.getByText('2 / 3')).toBeInTheDocument();
  });

  it('marks the current dot and disables "previous" on the first slide without loop', () => {
    render(<Carousel label="Features" items={items} />);
    expect(screen.getByRole('button', { name: 'Previous feature' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Go to Delivery metrics (1 of 3)' })).toHaveAttribute('aria-current', 'true');
  });
});
