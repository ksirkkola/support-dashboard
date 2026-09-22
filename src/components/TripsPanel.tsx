import {
  Box, SimpleGrid, Stat, StatLabel, StatNumber, Badge, Spinner, Button,
  Text, Flex, useColorModeValue, Heading, Divider, HStack, VStack, Select,
  useDisclosure, useToast, Collapse, Table, Thead, Tbody, Tr, Th, Td,
} from '@chakra-ui/react';
import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../hailer/use-app';
import NewCaseModal from './NewCaseModal';
import { syncTripsToCalendar } from '../tripCalendarSync';
import TripStageChart from './TripStageChart';

const INSIGHT_TRIPS = '6a4ba677a218e0e0d33b0017';

const currentYear = new Date().getFullYear().toString();

interface TripRow {
  id: string;
  name: string;
  phase: string;
  company: string | null;
  ticketCode: string | null;
  serviceType: string | null;
  assignedTraveler: string | null;
  arrivalDate: number | null;
  daysOnsite: number | null;
  totalTravelDays: number | null;
  purposeForTrip: string | null;
  clientIssues: string | null;
  assetText: string | null;
  asset1Name: string | null;
  asset2Name: string | null;
  asset3Name: string | null;
  yearOfService: string | null;
  travelNotes: string | null;
  poAmount: number | null;
  poNumber: string | null;
  invoicedAmount: number | null;
  iso17025: string | null;
  estimatedMonth: string | null;
}

function fmt(val: unknown): string {
  const n = Number(val);
  if (!val || isNaN(n) || n === 0) return '—';
  return '€' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function fmtDate(val: unknown): string {
  if (!val || isNaN(Number(val))) return '—';
  return new Date(Number(val) * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const PHASE_COLOR: Record<string, string> = {
  'Triage from Support Tickets': 'blue',
  'Pre-Travel Activities': 'cyan',
  'In Progress': 'green',
  'Follow-Up Activities': 'purple',
  'Waiting on PO': 'yellow',
  'Waiting on Dates': 'orange',
  'Closed': 'gray',
};

// Source data has been seen with a trailing space on "Closed " — trim before
// lookup/comparison everywhere so it isn't treated as an unmapped phase.
function phaseColor(phase: string): string {
  return PHASE_COLOR[phase.trim()] || 'gray';
}

function parseInsight(data: { headers: string[]; rows: unknown[][] }): TripRow[] {
  return data.rows.map(row => {
    const r: Record<string, unknown> = {};
    data.headers.forEach((h, i) => { r[h] = row[i]; });
    return r as unknown as TripRow;
  });
}

interface Props { refreshKey?: number; onCaseCreated?: () => void }
export default function TripsPanel({ refreshKey = 0, onCaseCreated }: Props) {
  const { hailer, inside, user } = useApp();
  const toast = useToast();
  const [rows, setRows] = useState<TripRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedTraveler, setSelectedTraveler] = useState('all');
  const [travelerDefaultApplied, setTravelerDefaultApplied] = useState(false);
  const [syncing, setSyncing] = useState(false);

  async function handleSyncCalendar() {
    setSyncing(true);
    try {
      const result = await syncTripsToCalendar(hailer!);
      toast({
        title: 'Synced to Field Service Trips calendar',
        description: `${result.created} event${result.created === 1 ? '' : 's'} created` +
          (result.skipped.length ? ` — ${result.skipped.length} trip${result.skipped.length === 1 ? '' : 's'} skipped (missing dates)` : ''),
        status: 'success', duration: 5000, isClosable: true,
      });
    } catch (err) {
      toast({ title: 'Calendar sync failed', description: String(err), status: 'error', duration: 6000, isClosable: true });
    }
    setSyncing(false);
  }
  const { isOpen, onOpen, onClose } = useDisclosure();

  const cardBg     = useColorModeValue('white', 'gray.700');
  const borderColor = useColorModeValue('gray.200', 'gray.600');
  const labelColor = useColorModeValue('gray.500', 'gray.400');
  const theadBg    = useColorModeValue('gray.50', 'gray.800');
  const rowHover   = useColorModeValue('gray.50', 'gray.600');

  useEffect(() => {
    if (!inside) return;
    setLoading(true);
    hailer!.insight.data(INSIGHT_TRIPS, { update: true })
      .then(data => {
        setRows(parseInsight(data));
        setLoading(false);
      })
      .catch(err => { setError(String(err)); setLoading(false); });
  }, [inside, refreshKey]);

  const yearMap: Record<string, TripRow[]> = {};
  for (const r of rows) {
    const y = String(r.yearOfService || 'Unknown').trim();
    if (!yearMap[y]) yearMap[y] = [];
    yearMap[y].push(r);
  }
  const years = Object.keys(yearMap).sort((a, b) => b.localeCompare(a));
  const yearScopedRows = yearMap[selectedYear] || rows;

  const travelers = useMemo(() => Array.from(new Set(rows.map(r => r.assignedTraveler).filter(Boolean))) as string[], [rows]);

  // Default the view to "my trips" once data + user are both loaded — only
  // decided once, so it doesn't fight a manual filter choice on later refreshes.
  useEffect(() => {
    if (travelerDefaultApplied) return;
    if (rows.length === 0 || !user.current) return;
    if (travelers.includes(user.current._id)) setSelectedTraveler(user.current._id);
    setTravelerDefaultApplied(true);
  }, [rows.length, user.current, travelers, travelerDefaultApplied]);

  const filteredRows = selectedTraveler === 'all'
    ? yearScopedRows
    : yearScopedRows.filter(r => r.assignedTraveler === selectedTraveler);

  const activeRows = filteredRows.filter(r => r.phase.trim() !== 'Closed');
  const closedRows = filteredRows.filter(r => r.phase.trim() === 'Closed');
  const { isOpen: isClosedOpen, onToggle: onClosedToggle } = useDisclosure();

  function userName(id: string | null): string {
    if (!id) return '—';
    const u = user.map[id];
    return u ? `${u.firstname} ${u.lastname}` : id;
  }

  if (loading) return <Flex justify="center" align="center" h="300px"><Spinner size="xl" /></Flex>;
  if (error)   return <Text color="red.500">Error: {error}</Text>;

  return (
    <Box>
      <Flex align="center" justify="space-between" gap={3} mb={1} wrap="wrap">
        <HStack>
          <Text fontWeight="semibold" whiteSpace="nowrap">Year of Service:</Text>
          <Select maxW="220px" size="sm" value={selectedYear} onChange={e => setSelectedYear(e.target.value)}>
            {years.map(y => <option key={y} value={y}>{y} ({yearMap[y].length})</option>)}
          </Select>
          <Text fontWeight="semibold" whiteSpace="nowrap">Assigned Engineer:</Text>
          <Select maxW="220px" size="sm" value={selectedTraveler} onChange={e => setSelectedTraveler(e.target.value)}>
            <option value="all">All Engineers</option>
            {travelers.map(id => <option key={id} value={id}>{userName(id)}</option>)}
          </Select>
        </HStack>
        <HStack>
          <Button size="sm" colorScheme="teal" variant="outline" isLoading={syncing} onClick={handleSyncCalendar}>
            🗓️ Sync Trips to Calendar
          </Button>
          <Button size="sm" colorScheme="green" onClick={onOpen}>+ New Case</Button>
        </HStack>
      </Flex>
      <Text fontSize="xs" color={labelColor} mb={5}>
        {selectedTraveler === 'all' ? 'Showing all engineers\u2019 trips.' : `Showing ${userName(selectedTraveler)}\u2019s trips.`}
      </Text>

      <NewCaseModal
        isOpen={isOpen}
        onClose={onClose}
        onSuccess={() => onCaseCreated?.()}
      />

      {filteredRows.length > 0 && (
        <Box bg={cardBg} border="1px" borderColor={borderColor} borderRadius="md" shadow="sm" p={4} mb={6}>
          <Text fontSize="sm" fontWeight="semibold" mb={2}>Trips by Stage</Text>
          <TripStageChart trips={filteredRows} />
        </Box>
      )}

      {activeRows.length === 0 ? (
        <Text color="gray.500">No open trips found for {selectedYear}.</Text>
      ) : (
        <SimpleGrid columns={{ base: 1, md: 2, xl: 3 }} spacing={5}>
          {activeRows.map(r => {
            const linkedAssets = [r.asset1Name, r.asset2Name, r.asset3Name].filter(Boolean) as string[];
            const assetDisplay = linkedAssets.length > 0 ? linkedAssets.join(', ') : r.assetText;
            const assetIsUnlinked = linkedAssets.length === 0 && !!r.assetText;
            return (
            <Box key={r.id} bg={cardBg} border="1px" borderColor={borderColor}
              borderTop="4px solid" borderTopColor={`${phaseColor(r.phase)}.400`}
              borderRadius="md" shadow="sm" cursor="pointer"
              onClick={() => hailer!.ui.activity.open(r.id)}>

              {/* Header */}
              <Box px={4} pt={4} pb={3} borderBottom="1px" borderColor={borderColor}>
                <Flex justify="space-between" align="start" mb={1}>
                  <Text fontWeight="bold" fontSize="sm" color="gray.400">{r.ticketCode || '—'}</Text>
                  <Badge colorScheme={phaseColor(r.phase)} fontSize="xs">{r.phase.trim()}</Badge>
                </Flex>
                <Heading size="sm" noOfLines={2}>{r.name}</Heading>
                <Text fontSize="sm" color={labelColor} mt={1}>{r.company || '—'}</Text>
              </Box>

              {/* Details */}
              <Box px={4} py={3}>
                <SimpleGrid columns={2} spacing={3} mb={3}>
                  <Box>
                    <Text fontSize="xs" color={labelColor}>Service Type</Text>
                    <Text fontSize="sm" fontWeight="medium">{r.serviceType || '—'}</Text>
                  </Box>
                  <Box>
                    <Text fontSize="xs" color={labelColor}>Assigned Engineer</Text>
                    <Text fontSize="sm" fontWeight="medium">{userName(r.assignedTraveler)}</Text>
                  </Box>
                  <Box>
                    <Text fontSize="xs" color={labelColor}>Arrival Date</Text>
                    <Text fontSize="sm" fontWeight="medium">{fmtDate(r.arrivalDate)}</Text>
                  </Box>
                  <Box>
                    <Text fontSize="xs" color={labelColor}>Days Onsite</Text>
                    <Text fontSize="sm" fontWeight="medium">{r.daysOnsite || '—'}</Text>
                  </Box>
                  <Box>
                    <Text fontSize="xs" color={labelColor}>Total Travel Days</Text>
                    <Text fontSize="sm" fontWeight="medium">{r.totalTravelDays || '—'}</Text>
                  </Box>
                  <Box>
                    <Text fontSize="xs" color={labelColor}>ISO 17025</Text>
                    <Text fontSize="sm" fontWeight="medium">{r.iso17025 || '—'}</Text>
                  </Box>
                  <Box>
                    <Text fontSize="xs" color={labelColor}>Est. Month</Text>
                    <Text fontSize="sm" fontWeight="medium">{r.estimatedMonth || '—'}</Text>
                  </Box>
                  <Box>
                    <Text fontSize="xs" color={labelColor}>Purpose</Text>
                    <Text fontSize="sm" fontWeight="medium">{r.purposeForTrip || '—'}</Text>
                  </Box>
                </SimpleGrid>

                {assetDisplay && (
                  <Box mb={3}>
                    <Text fontSize="xs" color={labelColor}>{linkedAssets.length > 1 ? 'Assets' : 'Asset'}</Text>
                    <Text fontSize="sm" fontWeight="medium">{assetDisplay}</Text>
                    {assetIsUnlinked && (
                      <Text fontSize="xs" color="orange.400" fontStyle="italic">Not yet linked to an asset record</Text>
                    )}
                  </Box>
                )}

                {r.clientIssues && (
                  <Box mb={3}>
                    <Text fontSize="xs" color={labelColor}>Client Issues</Text>
                    <Text fontSize="sm" noOfLines={3}>{r.clientIssues}</Text>
                  </Box>
                )}

                {r.travelNotes && (
                  <Box mb={3}>
                    <Text fontSize="xs" color={labelColor}>Travel Notes</Text>
                    <Text fontSize="sm" noOfLines={3}>{r.travelNotes}</Text>
                  </Box>
                )}

                <Divider mb={3} />

                <HStack justify="space-between">
                  <VStack align="start" spacing={0}>
                    <Text fontSize="xs" color={labelColor}>PO Number</Text>
                    <Text fontSize="sm" fontWeight="medium">{r.poNumber || '—'}</Text>
                  </VStack>
                  <VStack align="end" spacing={0}>
                    <Text fontSize="xs" color={labelColor}>PO Amount</Text>
                    <Text fontSize="sm" fontWeight="bold">{fmt(r.poAmount)}</Text>
                  </VStack>
                  <VStack align="end" spacing={0}>
                    <Text fontSize="xs" color={labelColor}>Invoiced</Text>
                    <Text fontSize="sm" fontWeight="bold">{fmt(r.invoicedAmount)}</Text>
                  </VStack>
                </HStack>
              </Box>
            </Box>
            );
          })}
        </SimpleGrid>
      )}

      {closedRows.length > 0 && (
        <Box mt={6}>
          <Button size="sm" variant="ghost" onClick={onClosedToggle} mb={2}>
            {isClosedOpen ? '▾' : '▸'} Recently Closed ({closedRows.length})
          </Button>
          <Collapse in={isClosedOpen} animateOpacity>
            <Box overflowX="auto" border="1px" borderColor={borderColor} borderRadius="md">
              <Table variant="simple" size="sm">
                <Thead bg={theadBg}>
                  <Tr>
                    <Th>Code</Th>
                    <Th>Trip / Case</Th>
                    <Th>Company</Th>
                    <Th>Assigned Engineer</Th>
                    <Th isNumeric>Invoiced</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {closedRows.map(r => (
                    <Tr key={r.id} _hover={{ bg: rowHover }} cursor="pointer"
                      onClick={() => hailer!.ui.activity.open(r.id)}>
                      <Td fontSize="sm" whiteSpace="nowrap" color={labelColor}>{r.ticketCode || '—'}</Td>
                      <Td fontSize="sm" fontWeight="medium" maxW="280px" isTruncated>{r.name}</Td>
                      <Td fontSize="sm">{r.company || '—'}</Td>
                      <Td fontSize="sm">{userName(r.assignedTraveler)}</Td>
                      <Td fontSize="sm" isNumeric>{fmt(r.invoicedAmount)}</Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </Box>
          </Collapse>
        </Box>
      )}
    </Box>
  );
}
