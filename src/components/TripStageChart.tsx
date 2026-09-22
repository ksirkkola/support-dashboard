import { Bar } from 'react-chartjs-2';
import 'chart.js/auto';
import { ChartData, ChartOptions } from 'chart.js';
import { Box, useColorModeValue } from '@chakra-ui/react';

interface TripLike { phase: string; }

const PHASE_ORDER = [
  'Triage from Support Tickets', 'Waiting on Dates', 'Waiting on PO',
  'Pre-Travel Activities', 'In Progress', 'Follow-Up Activities', 'Closed',
] as const;

// Matches the Badge colorScheme used in the stage table/cards.
const PHASE_HEX: Record<(typeof PHASE_ORDER)[number], string> = {
  'Triage from Support Tickets': '#4299E1',
  'Waiting on Dates': '#ED8936',
  'Waiting on PO': '#ECC94B',
  'Pre-Travel Activities': '#0BC5EA',
  'In Progress': '#48BB78',
  'Follow-Up Activities': '#9F7AEA',
  'Closed': '#A0AEC0',
};

function wrapLabel(label: string): string[] {
  const words = label.split(' ');
  const mid = Math.ceil(words.length / 2);
  return [words.slice(0, mid).join(' '), words.slice(mid).join(' ')];
}

interface Props { trips: TripLike[]; }

export default function TripStageChart({ trips }: Props) {
  const tickColor = useColorModeValue('#4A5568', '#CBD5E0');
  const gridColor = useColorModeValue('#E2E8F0', '#2D3748');

  const counts = PHASE_ORDER.map((p) => trips.filter((t) => t.phase.trim() === p).length);

  const data: ChartData<'bar'> = {
    labels: PHASE_ORDER.map(wrapLabel),
    datasets: [{
      label: 'Trips',
      data: counts,
      backgroundColor: PHASE_ORDER.map((p) => PHASE_HEX[p]),
      borderRadius: 4,
    }],
  };

  const options: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          title: (items) => (Array.isArray(items[0].label) ? items[0].label.join(' ') : items[0].label),
        },
      },
    },
    scales: {
      x: { ticks: { color: tickColor, font: { size: 11 } }, grid: { display: false } },
      y: {
        beginAtZero: true, ticks: { color: tickColor, precision: 0 },
        grid: { color: gridColor },
      },
    },
  };

  return (
    <Box h="240px">
      <Bar data={data} options={options} />
    </Box>
  );
}
