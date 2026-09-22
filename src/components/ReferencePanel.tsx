import {
  Box, Heading, SimpleGrid, Table, Thead, Tbody, Tr, Th, Td, Text, Badge,
  useColorModeValue, Spinner, Flex, Divider,
} from '@chakra-ui/react';
import { useEffect, useState } from 'react';
import { useApp } from '../hailer/use-app';
import { INSIGHT_SUPPORT_TICKETS, ST_PHASE_COLOR, TRIPS_PHASE_COLOR } from '../constants/ids';

const INSIGHT_WORK_ORDERS = '6a4ddad5d9b751c8857618a6';
const INSIGHT_TRIPS = '6a4ba677a218e0e0d33b0017';

interface PhaseInfo { phase: string; description: string }

const TICKET_PHASES: PhaseInfo[] = [
  { phase: 'New Ticket', description: 'Just came in — not yet triaged.' },
  { phase: 'Triage', description: "Being assessed to figure out what's needed and who should take it." },
  { phase: 'Working with Client', description: 'Actively being worked — engineer is in contact with the client.' },
  { phase: 'Software Upgrade', description: 'Waiting on or performing a software/firmware update.' },
  { phase: 'Follow-Up Activities', description: 'Main work is done — closing out loose ends (docs, confirmation, etc).' },
  { phase: 'Waiting on Billing', description: 'Work is complete; waiting on invoicing/PO before it can be marked Done.' },
];

const WORK_ORDER_PHASES: PhaseInfo[] = [
  { phase: 'New', description: 'Order just created — not yet started.' },
  { phase: 'Parts Sourcing', description: 'Waiting on parts/components to arrive.' },
  { phase: 'Assembly', description: 'Being built.' },
  { phase: 'QC / Testing', description: 'Built — going through quality checks.' },
  { phase: 'Ready to Ship', description: 'Passed QC — packaged and waiting for shipment.' },
  { phase: 'Shipped', description: 'Out the door — complete.' },
  { phase: 'On Hold', description: 'Paused — check the activity notes for why.' },
];

const TRIPS_PHASES: PhaseInfo[] = [
  { phase: 'Triage from Support Tickets', description: 'Just created from a Support Ticket — trip details not yet planned.' },
  { phase: 'Pre-Travel Activities', description: 'Planning the trip — dates, assets, logistics.' },
  { phase: 'In Progress', description: 'Engineer is on site / actively traveling.' },
  { phase: 'Follow-Up Activities', description: 'Onsite work done — closing out notes, reports, billing prep.' },
  { phase: 'Waiting on PO', description: "Waiting on the customer's purchase order before proceeding." },
  { phase: 'Waiting on Dates', description: 'Waiting on the customer to confirm scheduling.' },
];

const TERMS: { term: string; description: string }[] = [
  { term: 'Priority', description: 'Urgent > High > Normal > Low. When your queue is busy, work top-down.' },
  { term: 'Billable?', description: 'Whether this ticket is chargeable to the client vs. covered under warranty/contract.' },
  { term: 'ISO 17025', description: 'Calibration accreditation standard — flags whether the work needs to meet it.' },
  { term: 'PO Number / PO Amount', description: "The client's Purchase Order reference and value — needed before billable work is invoiced." },
  { term: 'Target Ship Date', description: 'When a Work Order is due to ship. Past this date and not yet Shipped = overdue (flagged red).' },
];

interface DirectoryRow { id: string; tickets: number; workOrders: number; trips: number }

function parseHeaders(data: { headers: string[]; rows: unknown[][] }) {
  return { headers: data.headers, rows: data.rows };
}

interface Props { refreshKey?: number }
export default function ReferencePanel({ refreshKey = 0 }: Props) {
  const { hailer, inside, user } = useApp();
  const [directory, setDirectory] = useState<DirectoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cardBg = useColorModeValue('white', 'gray.700');
  const borderColor = useColorModeValue('gray.200', 'gray.600');
  const theadBg = useColorModeValue('gray.50', 'gray.800');
  const mutedText = useColorModeValue('gray.500', 'gray.400');

  useEffect(() => {
    if (!inside) return;
    setLoading(true);
    Promise.all([
      hailer!.insight.data(INSIGHT_SUPPORT_TICKETS, { update: true }),
      hailer!.insight.data(INSIGHT_WORK_ORDERS, { update: true }),
      hailer!.insight.data(INSIGHT_TRIPS, { update: true }),
    ]).then(([tix, wo, trips]) => {
      const t = parseHeaders(tix);
      const w = parseHeaders(wo);
      const tr = parseHeaders(trips);
      const tixIdx = t.headers.indexOf('assignedEngineer');
      const woIdx = w.headers.indexOf('assignedTo');
      const tripIdx = tr.headers.indexOf('assignedTraveler');

      const counts: Record<string, DirectoryRow> = {};
      function bump(id: unknown, key: 'tickets' | 'workOrders' | 'trips') {
        const uid = id as string | null;
        if (!uid) return;
        if (!counts[uid]) counts[uid] = { id: uid, tickets: 0, workOrders: 0, trips: 0 };
        counts[uid][key]++;
      }
      if (tixIdx >= 0) t.rows.forEach(r => bump(r[tixIdx], 'tickets'));
      if (woIdx >= 0) w.rows.forEach(r => bump(r[woIdx], 'workOrders'));
      if (tripIdx >= 0) tr.rows.forEach(r => bump(r[tripIdx], 'trips'));

      setDirectory(Object.values(counts).sort((a, b) =>
        (b.tickets + b.workOrders + b.trips) - (a.tickets + a.workOrders + a.trips)));
      setLoading(false);
    }).catch(err => {
      setError(String(err));
      setLoading(false);
    });
  }, [inside, refreshKey]);

  function userName(id: string): string {
    const u = user.map[id];
    return u ? `${u.firstname} ${u.lastname}` : id;
  }

  function PhaseTable({ title, phases, colors }: { title: string; phases: PhaseInfo[]; colors: Record<string, string> }) {
    return (
      <Box p={4} bg={cardBg} borderRadius="md" shadow="sm" border="1px" borderColor={borderColor}>
        <Heading size="sm" mb={3}>{title}</Heading>
        <Table variant="simple" size="sm">
          <Tbody>
            {phases.map(p => (
              <Tr key={p.phase}>
                <Td whiteSpace="nowrap" verticalAlign="top">
                  <Badge colorScheme={colors[p.phase] || 'gray'}>{p.phase}</Badge>
                </Td>
                <Td fontSize="sm" color={mutedText}>{p.description}</Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </Box>
    );
  }

  return (
    <Box>
      <Text fontSize="sm" color={mutedText} mb={5}>
        New here? This is a quick reference for what the phases and terms mean across Support Tickets, Work Orders,
        and Trips / IHS, plus who else is on the team right now.
      </Text>

      <Heading size="sm" mb={3} color="gray.500" textTransform="uppercase" letterSpacing="wide">Phase Glossary</Heading>
      <SimpleGrid columns={{ base: 1, xl: 3 }} spacing={4} mb={6}>
        <PhaseTable title="Support Tickets" phases={TICKET_PHASES} colors={ST_PHASE_COLOR} />
        <PhaseTable title="Work Orders" phases={WORK_ORDER_PHASES} colors={{
          New: 'blue', 'Parts Sourcing': 'yellow', Assembly: 'purple', 'QC / Testing': 'cyan',
          'Ready to Ship': 'green', Shipped: 'teal', 'On Hold': 'red',
        }} />
        <PhaseTable title="Trips / IHS" phases={TRIPS_PHASES} colors={TRIPS_PHASE_COLOR} />
      </SimpleGrid>

      <Heading size="sm" mb={3} color="gray.500" textTransform="uppercase" letterSpacing="wide">Terms You'll See</Heading>
      <Box p={4} bg={cardBg} borderRadius="md" shadow="sm" border="1px" borderColor={borderColor} mb={6}>
        <Table variant="simple" size="sm">
          <Tbody>
            {TERMS.map(t => (
              <Tr key={t.term}>
                <Td whiteSpace="nowrap" fontWeight="semibold" verticalAlign="top">{t.term}</Td>
                <Td fontSize="sm" color={mutedText}>{t.description}</Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </Box>

      <Heading size="sm" mb={3} color="gray.500" textTransform="uppercase" letterSpacing="wide">Who's on Support Right Now</Heading>
      <Text fontSize="xs" color={mutedText} mb={3}>
        Built from current open work — not a fixed org chart. This workspace doesn't have a specific escalation
        contact configured; if you're stuck, ask your manager or reach out to anyone below.
      </Text>
      {loading ? (
        <Flex justify="center" align="center" h="120px"><Spinner size="lg" /></Flex>
      ) : error ? (
        <Text color="red.500">Error loading directory: {error}</Text>
      ) : directory.length === 0 ? (
        <Text color={mutedText}>No open items are currently assigned to anyone.</Text>
      ) : (
        <Box overflowX="auto" border="1px" borderColor={borderColor} borderRadius="md">
          <Table variant="simple" size="sm">
            <Thead bg={theadBg}>
              <Tr>
                <Th>Name</Th>
                <Th isNumeric>Open Tickets</Th>
                <Th isNumeric>Open Work Orders</Th>
                <Th isNumeric>Open Trips</Th>
                <Th isNumeric>Total</Th>
              </Tr>
            </Thead>
            <Tbody>
              {directory.map(d => (
                <Tr key={d.id} fontWeight={d.id === user.current?._id ? 'bold' : 'normal'}>
                  <Td>{userName(d.id)}{d.id === user.current?._id ? ' (you)' : ''}</Td>
                  <Td isNumeric>{d.tickets}</Td>
                  <Td isNumeric>{d.workOrders}</Td>
                  <Td isNumeric>{d.trips}</Td>
                  <Td isNumeric fontWeight="bold">{d.tickets + d.workOrders + d.trips}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </Box>
      )}

      <Divider mt={6} mb={4} />
      <Text fontSize="xs" color={mutedText}>
        Tip: every panel in this app has a filter that defaults to showing just your own queue — switch it to
        "All" any time you want the full team view.
      </Text>
    </Box>
  );
}
