import {
  Box, Button, Flex, Input, Select, SimpleGrid, Spinner, Stat, StatHelpText,
  StatLabel, StatNumber, Table, Tbody, Td, Text, Th, Thead, Tr, Badge,
  useColorModeValue,
} from '@chakra-ui/react';
import { useMemo, useState } from 'react';
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { useApp } from '../hailer/use-app';
import {
  INSIGHT_THERMDAC_SETTINGS, INSIGHT_THERMDAC_VERSIONS,
  ST_FIELD_ASSET_LINK, ST_FIELD_COMPANY, ST_PHASE_NEW_TICKET, WORKFLOW_SUPPORT_TICKETS,
} from '../constants/ids';
import { useInsight } from '../hailer/use-insight';

interface AssetRow {
  activityId: string;
  name: string;
  customerName: string | null;
  productFamily: string | null;
  status: string | null;
  thermdacVersion: string | null;
  thermdacVersionLastUpdated: number | null;
  purchaseDate: number | null;
}

type AgeBucket = 'All Ages' | '0-1 years' | '1-3 years' | '3-5 years' | '5+ years' | 'Unknown';
const AGE_BUCKETS: AgeBucket[] = ['All Ages', '0-1 years', '1-3 years', '3-5 years', '5+ years', 'Unknown'];

// Mirrors the "Asset Age" function field's own math (purchaseDate is stored in
// seconds in insights; the function field reads it in ms from the activity
// directly, so *1000 here to match) — kept in sync deliberately so the number
// shown here never disagrees with what's on the Asset record itself.
function ageYears(purchaseDateSec: number | null): number | null {
  if (!purchaseDateSec) return null;
  const purchaseMs = purchaseDateSec * 1000;
  const ms = Date.now() - purchaseMs;
  return ms / (1000 * 60 * 60 * 24 * 365.25);
}

function ageLabel(purchaseDateSec: number | null): string {
  if (!purchaseDateSec) return 'Unknown';
  const purchaseDate = new Date(purchaseDateSec * 1000);
  const today = new Date();
  let years = today.getFullYear() - purchaseDate.getFullYear();
  let months = today.getMonth() - purchaseDate.getMonth();
  if (months < 0) { years--; months += 12; }
  const yearLabel = years === 1 ? 'year' : 'years';
  const monthLabel = months === 1 ? 'month' : 'months';
  if (years === 0) return `${months} ${monthLabel}`;
  if (months === 0) return `${years} ${yearLabel}`;
  return `${years} ${yearLabel} ${months} ${monthLabel}`;
}

function ageBucket(purchaseDateSec: number | null): AgeBucket {
  const years = ageYears(purchaseDateSec);
  if (years === null) return 'Unknown';
  if (years < 1) return '0-1 years';
  if (years < 3) return '1-3 years';
  if (years < 5) return '3-5 years';
  return '5+ years';
}

function fmtDate(val: number | null): string {
  if (!val) return '—';
  return new Date(val * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

type SortKey = 'name' | 'customerName' | 'status' | 'thermdacVersion' | 'age';

export default function ThermDACPanel(props: { refreshKey?: number }) {
  const { hailer, inside } = useApp();
  const { rows: assetRows, loading: loadingAssets } = useInsight<AssetRow>(INSIGHT_THERMDAC_VERSIONS, props.refreshKey);
  const { rows: settingsRows, loading: loadingSettings } = useInsight<{ currentVersion: string; notes: string }>(
    INSIGHT_THERMDAC_SETTINGS, props.refreshKey,
  );

  const [search, setSearch] = useState('');
  const [outdatedOnly, setOutdatedOnly] = useState(true);
  const [ageFilter, setAgeFilter] = useState<AgeBucket>('All Ages');
  const [sortKey, setSortKey] = useState<SortKey>('customerName');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const cardBg = useColorModeValue('white', 'gray.700');
  const borderColor = useColorModeValue('gray.200', 'gray.600');
  const rowHover = useColorModeValue('gray.50', 'gray.600');
  const theadBg = useColorModeValue('gray.50', 'gray.800');
  const mutedText = useColorModeValue('gray.500', 'gray.400');

  const settings = settingsRows[0];
  const currentVersion = settings?.currentVersion ?? null;

  const activeAssets = useMemo(() => assetRows.filter(a => a.status !== 'Retired'), [assetRows]);
  const upToDate = activeAssets.filter(a => currentVersion && a.thermdacVersion === currentVersion);
  const outdatedOrUnknown = activeAssets.filter(a => !currentVersion || a.thermdacVersion !== currentVersion);
  const neverRecorded = activeAssets.filter(a => !a.thermdacVersion);
  const needsStatusReview = activeAssets.filter(a => !a.status);

  const versionCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const a of activeAssets) {
      const v = a.thermdacVersion || 'Not Recorded';
      counts[v] = (counts[v] || 0) + 1;
    }
    return Object.entries(counts).map(([version, count]) => ({ version, count }));
  }, [activeAssets]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = activeAssets.filter(a => {
      if (outdatedOnly && currentVersion && a.thermdacVersion === currentVersion) return false;
      if (ageFilter !== 'All Ages' && ageBucket(a.purchaseDate) !== ageFilter) return false;
      if (!q) return true;
      return (a.customerName || '').toLowerCase().includes(q) || a.name.toLowerCase().includes(q);
    });

    rows = rows.slice().sort((a, b) => {
      let av: string | number;
      let bv: string | number;
      if (sortKey === 'age') {
        av = ageYears(a.purchaseDate) ?? -1;
        bv = ageYears(b.purchaseDate) ?? -1;
      } else {
        av = (a[sortKey] || '').toString().toLowerCase();
        bv = (b[sortKey] || '').toString().toLowerCase();
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return rows;
  }, [activeAssets, search, outdatedOnly, ageFilter, sortKey, sortDir, currentVersion]);

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  }
  function sortIndicator(key: SortKey) {
    if (sortKey !== key) return '';
    return sortDir === 'asc' ? ' \u25B2' : ' \u25BC';
  }

  function openSupportTicketFor(asset: AssetRow) {
    if (!hailer) return;
    void hailer.ui.activity.create(WORKFLOW_SUPPORT_TICKETS, {
      name: `${asset.customerName || 'Unknown'} - ${asset.name} - ThermDAC`,
      phaseId: ST_PHASE_NEW_TICKET,
      fields: {
        ...(asset.customerName ? { [ST_FIELD_COMPANY]: asset.customerName } : {}),
        [ST_FIELD_ASSET_LINK]: asset.activityId,
      },
    });
  }

  if (!inside || loadingAssets || loadingSettings) {
    return <Flex justify="center" align="center" h="200px"><Spinner size="xl" /></Flex>;
  }

  return (
    <Box>
      <Text fontSize="sm" color={mutedText} mb={4}>
        ThermDAC ships with every system — unlike ManikinPC, there's no prospecting involved here, just
        tracking which version each client's system is running so upgrades can be scheduled. Retired
        systems are excluded once flagged as such on the Asset's Status field.
      </Text>

      <SimpleGrid columns={{ base: 2, md: 5 }} spacing={3} mb={5}>
        <Box p={4} bg={cardBg} borderRadius="md" shadow="sm" border="1px" borderColor={borderColor}>
          <Stat>
            <StatLabel>Current Release</StatLabel>
            <StatNumber fontSize="lg">{currentVersion || '—'}</StatNumber>
            <StatHelpText noOfLines={2}>{settings?.notes || '—'}</StatHelpText>
          </Stat>
        </Box>
        <Box p={4} bg={cardBg} borderRadius="md" shadow="sm" border="1px" borderColor={borderColor}>
          <Stat>
            <StatLabel>Active Systems</StatLabel>
            <StatNumber>{activeAssets.length}</StatNumber>
            <StatHelpText>Retired systems excluded</StatHelpText>
          </Stat>
        </Box>
        <Box p={4} bg={cardBg} borderRadius="md" shadow="sm" border="1px" borderColor={borderColor}>
          <Stat>
            <StatLabel>Up to Date</StatLabel>
            <StatNumber color="green.500">{upToDate.length}</StatNumber>
          </Stat>
        </Box>
        <Box p={4} bg={cardBg} borderRadius="md" shadow="sm" border="1px" borderColor="orange.400" borderWidth="2px">
          <Stat>
            <StatLabel>Outdated / Unknown</StatLabel>
            <StatNumber color="orange.500">{outdatedOrUnknown.length}</StatNumber>
            <StatHelpText>{neverRecorded.length} never recorded</StatHelpText>
          </Stat>
        </Box>
        <Box p={4} bg={cardBg} borderRadius="md" shadow="sm" border="1px" borderColor="orange.400" borderWidth="2px">
          <Stat>
            <StatLabel>Needs Status Review</StatLabel>
            <StatNumber color="orange.500">{needsStatusReview.length}</StatNumber>
            <StatHelpText>Active/Retired not yet confirmed</StatHelpText>
          </Stat>
        </Box>
      </SimpleGrid>

      <Box p={4} bg={cardBg} borderRadius="md" shadow="sm" border="1px" borderColor={borderColor} mb={5}>
        <Text fontWeight="semibold" fontSize="sm" mb={3} color={mutedText}>Installed Versions Across the Fleet</Text>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={versionCounts} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
            <XAxis dataKey="version" interval={0} tick={{ fontSize: 12 }} />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="count" fill="#A0AEC0" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Box>

      <Flex gap={3} mb={2} wrap="wrap" align="center">
        <Input maxW="260px" size="sm" placeholder="Search customer or system..." value={search}
          onChange={e => setSearch(e.target.value)} />
        <Button
          size="sm"
          variant={outdatedOnly ? 'solid' : 'outline'}
          colorScheme="orange"
          onClick={() => setOutdatedOnly(v => !v)}
        >
          Outdated Only
        </Button>
        <Select size="sm" maxW="150px" value={ageFilter} onChange={e => setAgeFilter(e.target.value as AgeBucket)}>
          {AGE_BUCKETS.map(b => <option key={b} value={b}>{b}</option>)}
        </Select>
        <Text fontSize="xs" color={mutedText}>Showing {filtered.length} of {activeAssets.length} systems</Text>
      </Flex>

      <Box overflowX="auto" border="1px" borderColor={borderColor} borderRadius="md">
        <Table variant="simple" size="sm">
          <Thead bg={theadBg}>
            <Tr>
              <Th cursor="pointer" onClick={() => handleSort('customerName')} userSelect="none">Customer{sortIndicator('customerName')}</Th>
              <Th cursor="pointer" onClick={() => handleSort('name')} userSelect="none">System{sortIndicator('name')}</Th>
              <Th cursor="pointer" onClick={() => handleSort('status')} userSelect="none">Status{sortIndicator('status')}</Th>
              <Th cursor="pointer" onClick={() => handleSort('thermdacVersion')} userSelect="none">Version{sortIndicator('thermdacVersion')}</Th>
              <Th cursor="pointer" onClick={() => handleSort('age')} userSelect="none">Age{sortIndicator('age')}</Th>
              <Th>Last Updated</Th>
              <Th>Action</Th>
            </Tr>
          </Thead>
          <Tbody>
            {filtered.length === 0 ? (
              <Tr><Td colSpan={7}><Text color={mutedText}>No systems match these filters.</Text></Td></Tr>
            ) : filtered.map(a => (
              <Tr key={a.activityId} _hover={{ bg: rowHover }}>
                <Td cursor="pointer" onClick={() => hailer!.ui.activity.open(a.activityId)}>{a.customerName || '—'}</Td>
                <Td cursor="pointer" onClick={() => hailer!.ui.activity.open(a.activityId)}>{a.name}</Td>
                <Td>
                  {a.status
                    ? <Badge colorScheme={a.status === 'Retired' ? 'gray' : 'green'}>{a.status.toUpperCase()}</Badge>
                    : <Badge colorScheme="orange">NEEDS REVIEW</Badge>}
                </Td>
                <Td>
                  {a.thermdacVersion
                    ? <Badge colorScheme={a.thermdacVersion === currentVersion ? 'green' : 'orange'}>{a.thermdacVersion}</Badge>
                    : <Badge colorScheme="gray">NOT RECORDED</Badge>}
                </Td>
                <Td whiteSpace="nowrap">{ageLabel(a.purchaseDate)}</Td>
                <Td whiteSpace="nowrap">{fmtDate(a.thermdacVersionLastUpdated)}</Td>
                <Td>
                  <Button size="xs" variant="outline" colorScheme="blue" onClick={() => openSupportTicketFor(a)}>
                    + Support Ticket
                  </Button>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </Box>
    </Box>
  );
}
