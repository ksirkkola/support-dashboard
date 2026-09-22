import {
  Box, Button, Flex, Input, Select, SimpleGrid, Spinner, Stat, StatHelpText,
  StatLabel, StatNumber, Table, Tbody, Td, Text, Th, Thead, Tr,
  useColorModeValue,
} from '@chakra-ui/react';
import { useMemo, useState } from 'react';
import { useApp } from '../hailer/use-app';
import { INSIGHT_TIME_TRACKING, TT_PHASE_COLOR, WORKFLOW_TIME_TRACKING } from '../constants/ids';
import { useInsight } from '../hailer/use-insight';

interface TimeRow {
  id: string;
  phase: string;
  date: number | null;
  supportTicket: string | null;
  reportedBy: string | null;
  timeUsed: number | null;
  description: string | null;
  ticketCode: string | null;
  company: string | null;
}

const STATUSES: Array<'Reported' | 'Invoiced' | 'Paid'> = ['Reported', 'Invoiced', 'Paid'];

function fmtDate(val: number | null): string {
  if (!val) return '—';
  return new Date(val * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function TimeTrackingPanel(props: { refreshKey?: number; onRefresh?: () => void }) {
  const { hailer, inside, user } = useApp();
  const { rows, loading } = useInsight<TimeRow>(INSIGHT_TIME_TRACKING, props.refreshKey);

  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [engineerFilter, setEngineerFilter] = useState('all');
  const [search, setSearch] = useState('');

  const cardBg = useColorModeValue('white', 'gray.700');
  const borderColor = useColorModeValue('gray.200', 'gray.600');
  const theadBg = useColorModeValue('gray.50', 'gray.800');
  const rowHover = useColorModeValue('gray.50', 'gray.600');
  const mutedText = useColorModeValue('gray.500', 'gray.400');
  const activeTileBorder = useColorModeValue('blue.400', 'blue.300');

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { Reported: 0, Invoiced: 0, Paid: 0 };
    for (const r of rows) if (counts[r.phase] !== undefined) counts[r.phase]++;
    return counts;
  }, [rows]);

  const engineers = useMemo(
    () => Array.from(new Set(rows.map(r => r.reportedBy).filter(Boolean))) as string[],
    [rows],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(r => {
      if (statusFilter && r.phase !== statusFilter) return false;
      if (engineerFilter !== 'all' && r.reportedBy !== engineerFilter) return false;
      if (!q) return true;
      return (
        (r.ticketCode || '').toLowerCase().includes(q) ||
        (r.company || '').toLowerCase().includes(q) ||
        (r.description || '').toLowerCase().includes(q)
      );
    });
  }, [rows, statusFilter, engineerFilter, search]);

  const filteredHours = filtered.reduce((s, r) => s + (Number(r.timeUsed) || 0), 0);
  const awaitingInvoiceHours = rows
    .filter(r => r.phase === 'Reported')
    .reduce((s, r) => s + (Number(r.timeUsed) || 0), 0);

  function openLogTime() {
    if (!hailer) return;
    void hailer.ui.activity.create(WORKFLOW_TIME_TRACKING).then(result => {
      if (result) props.onRefresh?.();
    });
  }

  if (!inside || loading) {
    return <Flex justify="center" align="center" h="200px"><Spinner size="xl" /></Flex>;
  }

  return (
    <Box>
      <Flex justify="space-between" align="center" mb={1} wrap="wrap" gap={2}>
        <Text fontSize="sm" color={mutedText}>
          Log hours against support tickets, then move entries through Reported → Invoiced → Paid as billing progresses.
        </Text>
        <Button size="sm" colorScheme="blue" onClick={openLogTime}>+ Log Time</Button>
      </Flex>
      <Text fontSize="xs" color={mutedText} mb={4}>Click a tile to filter the list below to that status.</Text>

      <SimpleGrid columns={{ base: 1, md: 3 }} spacing={3} mb={4}>
        {STATUSES.map(status => (
          <Box
            key={status}
            p={4}
            bg={cardBg}
            borderRadius="md"
            shadow="sm"
            border="1px"
            borderColor={statusFilter === status ? activeTileBorder : borderColor}
            borderTop="3px solid"
            borderTopColor={`${TT_PHASE_COLOR[status]}.400`}
            cursor="pointer"
            onClick={() => setStatusFilter(f => (f === status ? null : status))}
          >
            <Stat>
              <StatLabel>{status}</StatLabel>
              <StatNumber>{statusCounts[status]}</StatNumber>
            </Stat>
          </Box>
        ))}
      </SimpleGrid>

      <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3} mb={5}>
        <Box p={4} bg={cardBg} borderRadius="md" shadow="sm" border="1px" borderColor={borderColor}>
          <Stat>
            <StatLabel>Hours (filtered view)</StatLabel>
            <StatNumber>{filteredHours.toFixed(1)}</StatNumber>
            <StatHelpText>{filtered.length} entries</StatHelpText>
          </Stat>
        </Box>
        <Box p={4} bg={cardBg} borderRadius="md" shadow="sm" border="1px" borderColor={borderColor}>
          <Stat>
            <StatLabel>Awaiting Invoice</StatLabel>
            <StatNumber color="blue.500">{awaitingInvoiceHours.toFixed(1)}</StatNumber>
            <StatHelpText>Hours still in "Reported"</StatHelpText>
          </Stat>
        </Box>
      </SimpleGrid>

      <Flex gap={3} mb={4} wrap="wrap" align="center">
        <Select maxW="180px" size="sm" value={engineerFilter} onChange={e => setEngineerFilter(e.target.value)}>
          <option value="all">All Engineers</option>
          {engineers.map(id => {
            const u = user.map[id];
            return <option key={id} value={id}>{u ? `${u.firstname} ${u.lastname}` : id}</option>;
          })}
        </Select>
        <Input maxW="280px" size="sm" placeholder="Search ticket, company, description..." value={search}
          onChange={e => setSearch(e.target.value)} />
      </Flex>

      {filtered.length === 0 ? (
        <Text color={mutedText}>No time entries match these filters.</Text>
      ) : (
        <Box overflowX="auto" border="1px" borderColor={borderColor} borderRadius="md">
          <Table variant="simple" size="sm">
            <Thead bg={theadBg}>
              <Tr>
                <Th>Date</Th>
                <Th>Ticket</Th>
                <Th>Company</Th>
                <Th>Engineer</Th>
                <Th isNumeric>Hours</Th>
                <Th>Description</Th>
                <Th>Status</Th>
              </Tr>
            </Thead>
            <Tbody>
              {filtered.map(r => (
                <Tr key={r.id} _hover={{ bg: rowHover }} cursor="pointer" onClick={() => hailer!.ui.activity.open(r.id)}>
                  <Td whiteSpace="nowrap">{fmtDate(r.date)}</Td>
                  <Td>{r.ticketCode || '—'}</Td>
                  <Td maxW="160px" isTruncated>{r.company || '—'}</Td>
                  <Td whiteSpace="nowrap">
                    {r.reportedBy
                      ? (() => { const u = user.map[r.reportedBy!]; return u ? `${u.firstname} ${u.lastname}` : r.reportedBy; })()
                      : '—'}
                  </Td>
                  <Td isNumeric>{r.timeUsed ?? '—'}</Td>
                  <Td maxW="260px" isTruncated>{r.description || '—'}</Td>
                  <Td>{r.phase}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </Box>
      )}
    </Box>
  );
}
