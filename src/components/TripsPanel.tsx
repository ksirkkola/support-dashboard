import {
  Box, SimpleGrid, Stat, StatLabel, StatNumber, Badge, Spinner,
  Text, Flex, useColorModeValue, Heading, Divider, HStack, VStack, Select,
} from '@chakra-ui/react';
import { useEffect, useState } from 'react';
import { useApp } from '../hailer/use-app';

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
  asset1: string | null;
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
  'Pre-Calibration Activities': 'cyan',
  'In Progress': 'green',
  'Follow-Up Activities': 'purple',
  'Waiting on PO': 'yellow',
  'Waiting on Dates': 'orange',
};

function parseInsight(data: { headers: string[]; rows: unknown[][] }): TripRow[] {
  return data.rows.map(row => {
    const r: Record<string, unknown> = {};
    data.headers.forEach((h, i) => { r[h] = row[i]; });
    return r as unknown as TripRow;
  });
}

interface Props { refreshKey?: number }
export default function TripsPanel({ refreshKey = 0 }: Props) {
  const { hailer, inside, user } = useApp();
  const [rows, setRows] = useState<TripRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState(currentYear);

  const cardBg     = useColorModeValue('white', 'gray.700');
  const borderColor = useColorModeValue('gray.200', 'gray.600');
  const labelColor = useColorModeValue('gray.500', 'gray.400');

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
  const filteredRows = yearMap[selectedYear] || rows;

  function userName(id: string | null): string {
    if (!id) return '—';
    const u = user.map[id];
    return u ? `${u.firstname} ${u.lastname}` : id;
  }

  if (loading) return <Flex justify="center" align="center" h="300px"><Spinner size="xl" /></Flex>;
  if (error)   return <Text color="red.500">Error: {error}</Text>;

  return (
    <Box>
      <Flex align="center" gap={3} mb={6}>
        <Text fontWeight="semibold" whiteSpace="nowrap">Year of Service:</Text>
        <Select maxW="220px" size="sm" value={selectedYear} onChange={e => setSelectedYear(e.target.value)}>
          {years.map(y => <option key={y} value={y}>{y} ({yearMap[y].length})</option>)}
        </Select>
      </Flex>

      {filteredRows.length === 0 ? (
        <Text color="gray.500">No open trips found for {selectedYear}.</Text>
      ) : (
        <SimpleGrid columns={{ base: 1, md: 2, xl: 3 }} spacing={5}>
          {filteredRows.map(r => (
            <Box key={r.id} bg={cardBg} border="1px" borderColor={borderColor}
              borderTop="4px solid" borderTopColor={`${PHASE_COLOR[r.phase] || 'gray'}.400`}
              borderRadius="md" shadow="sm" cursor="pointer"
              onClick={() => hailer!.ui.activity.open(r.id)}>

              {/* Header */}
              <Box px={4} pt={4} pb={3} borderBottom="1px" borderColor={borderColor}>
                <Flex justify="space-between" align="start" mb={1}>
                  <Text fontWeight="bold" fontSize="sm" color="gray.400">{r.ticketCode || '—'}</Text>
                  <Badge colorScheme={PHASE_COLOR[r.phase] || 'gray'} fontSize="xs">{r.phase}</Badge>
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

                {r.asset1 && (
                  <Box mb={3}>
                    <Text fontSize="xs" color={labelColor}>Asset</Text>
                    <Text fontSize="sm" fontWeight="medium">{r.asset1}</Text>
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
          ))}
        </SimpleGrid>
      )}
    </Box>
  );
}
