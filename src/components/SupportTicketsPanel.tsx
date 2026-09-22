import {
  Box, SimpleGrid, Stat, StatLabel, StatNumber, StatHelpText,
  Table, Thead, Tbody, Tr, Th, Td, Spinner, Text, Badge, Checkbox,
  useColorModeValue, Flex, Select, Input, Button, useToast, useDisclosure,
} from '@chakra-ui/react';
import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../hailer/use-app';
import { INSIGHT_SUPPORT_TICKETS, ST_PHASE_COLOR } from '../constants/ids';
import NewCaseModal from './NewCaseModal';

const INSIGHT_RESOLVED = '6a4618a1e63a006e15353ada';

const PHASE_DONE = '6a06e492112c3668ef86bbee';
const FIELD_SUPPORT_ENGINEER = '6a06e492112c3668ef86bbdd';

const UNASSIGNED = '__unassigned__';
const ALL_COMPANIES = 'All Companies';
const ALL_PHASES = 'All Statuses';

interface TicketRow {
  id: string;
  name: string;
  phase: string;
  ticketCode: string | null;
  company: string | null;
  inboxFolderCreated: string | null;
  issues: string | null;
  dateReceived: number | null;
  assignedEngineer: string | null;
  billable: string | null;
  priority: string | null;
  customerId: string | null;
}

const PRIORITY_COLOR: Record<string, string> = {
  Urgent: 'red',
  High: 'orange',
  Normal: 'blue',
  Low: 'gray',
};
const PRIORITY_RANK: Record<string, number> = { Urgent: 0, High: 1, Normal: 2, Low: 3 };

function fmtDate(val: number | null): string {
  if (!val || isNaN(val)) return '—';
  return new Date(Number(val) * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Days since the ticket was received, based on the last time it was touched IN
// HAILER — not a claim that the ticket is genuinely "stuck". Since all support
// communication happens over email (outside Hailer), an aging ticket may well
// be actively progressing via email threads Hailer never sees. This is a
// passive visibility cue for a human to judge, not an automated stuck-ticket
// detector.
function daysOpen(dateReceived: number | null): number | null {
  if (!dateReceived || isNaN(dateReceived)) return null;
  return Math.floor((Date.now() / 1000 - dateReceived) / 86400);
}

function agingColor(days: number | null): string | null {
  if (days === null) return null;
  if (days >= 14) return 'red';
  if (days >= 7) return 'orange';
  return null;
}

const OPEN_PHASES = ['New Ticket', 'Triage', 'Working with Client', 'Software Upgrade', 'Follow-Up Activities', 'Waiting on Billing'];

type SortKey = 'priority' | 'ticketCode' | 'company' | 'phase' | 'assignedEngineer' | 'dateReceived' | 'daysOpen';

interface Props { refreshKey?: number; onRefresh?: () => void }
export default function SupportTicketsPanel({ refreshKey = 0, onRefresh }: Props) {
  const { hailer, inside, user } = useApp();
  const toast = useToast();
  const [rows, setRows] = useState<TicketRow[]>([]);
  const [avgDays, setAvgDays] = useState<number | null>(null);
  const [resolvedCount, setResolvedCount] = useState(0);
  const [selectedEngineer, setSelectedEngineer] = useState('all');
  const [engineerDefaultApplied, setEngineerDefaultApplied] = useState(false);
  const [selectedPhase, setSelectedPhase] = useState(ALL_PHASES);
  const [selectedCompany, setSelectedCompany] = useState(ALL_COMPANIES);
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('priority');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkEngineer, setBulkEngineer] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tripSourceTicket, setTripSourceTicket] = useState<TicketRow | null>(null);
  const { isOpen: isTripModalOpen, onOpen: openTripModal, onClose: closeTripModal } = useDisclosure();

  const cardBg = useColorModeValue('white', 'gray.700');
  const rowHover = useColorModeValue('gray.50', 'gray.600');
  const borderColor = useColorModeValue('gray.200', 'gray.600');
  const theadBg = useColorModeValue('gray.50', 'gray.800');
  const mutedText = useColorModeValue('gray.500', 'gray.400');
  const bulkBarBg = useColorModeValue('blue.50', 'blue.900');

  function load() {
    if (!inside) return;
    setLoading(true);
    Promise.all([
      hailer!.insight.data(INSIGHT_SUPPORT_TICKETS, { update: true }),
      hailer!.insight.data(INSIGHT_RESOLVED, { update: true }),
    ]).then(([openData, resolvedData]) => {
      const headers: string[] = openData.headers;
      const parsed: TicketRow[] = openData.rows.map((row: unknown[]) => {
        const r: Record<string, unknown> = {};
        headers.forEach((h, i) => { r[h] = row[i]; });
        return r as unknown as TicketRow;
      });
      setRows(parsed);

      // Calculate average resolution time in days
      const resolved = resolvedData.rows.filter(r => r[1] && r[2]);
      setResolvedCount(resolved.length);
      if (resolved.length > 0) {
        const totalDays = resolved.reduce((sum, r) => {
          const start = Number(r[1]) * 1000;
          const end = Number(r[2]) * 1000;
          return sum + Math.max(0, (end - start) / (1000 * 60 * 60 * 24));
        }, 0);
        setAvgDays(Math.round(totalDays / resolved.length));
      }

      setLoading(false);
    }).catch(err => {
      setError(String(err));
      setLoading(false);
    });
  }

  useEffect(load, [inside, refreshKey]);

  // Build list of unique engineers/companies from rows
  const engineers = useMemo(() => Array.from(new Set(rows.map(r => r.assignedEngineer).filter(Boolean))) as string[], [rows]);
  const companies = useMemo(() => Array.from(new Set(rows.map(r => r.company).filter(Boolean))).sort() as string[], [rows]);

  // Default the view to "my tickets" once data + user are both loaded — only
  // decided once, so it doesn't fight a manual filter choice on later refreshes.
  useEffect(() => {
    if (engineerDefaultApplied) return;
    if (rows.length === 0 || !user.current) return;
    if (engineers.includes(user.current._id)) setSelectedEngineer(user.current._id);
    setEngineerDefaultApplied(true);
  }, [rows.length, user.current, engineers, engineerDefaultApplied]);

  const searched = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r =>
      (r.ticketCode || '').toLowerCase().includes(q) ||
      (r.company || '').toLowerCase().includes(q) ||
      (r.issues || '').toLowerCase().includes(q) ||
      (r.name || '').toLowerCase().includes(q));
  }, [rows, search]);

  const fromSec = dateFrom ? new Date(dateFrom).getTime() / 1000 : null;
  const toSec = dateTo ? new Date(dateTo).getTime() / 1000 + 86400 : null; // inclusive of the whole "to" day

  const filteredRows = useMemo(() => {
    const rows2 = searched.filter(r => {
      if (selectedEngineer === 'all') { /* no-op */ }
      else if (selectedEngineer === UNASSIGNED) { if (r.assignedEngineer) return false; }
      else if (r.assignedEngineer !== selectedEngineer) return false;

      if (selectedPhase !== ALL_PHASES && r.phase !== selectedPhase) return false;
      if (selectedCompany !== ALL_COMPANIES && r.company !== selectedCompany) return false;
      if (fromSec !== null && (r.dateReceived === null || r.dateReceived < fromSec)) return false;
      if (toSec !== null && (r.dateReceived === null || r.dateReceived >= toSec)) return false;
      return true;
    });

    const sorted = rows2.slice().sort((a, b) => {
      let av: number | string;
      let bv: number | string;
      switch (sortKey) {
        case 'priority':
          av = PRIORITY_RANK[a.priority || ''] ?? 99;
          bv = PRIORITY_RANK[b.priority || ''] ?? 99;
          break;
        case 'dateReceived':
          av = a.dateReceived ?? 0;
          bv = b.dateReceived ?? 0;
          break;
        case 'daysOpen':
          av = daysOpen(a.dateReceived) ?? -1;
          bv = daysOpen(b.dateReceived) ?? -1;
          break;
        case 'assignedEngineer': {
          const an = a.assignedEngineer ? user.map[a.assignedEngineer] : null;
          const bn = b.assignedEngineer ? user.map[b.assignedEngineer] : null;
          av = (an ? `${an.firstname} ${an.lastname}` : '').toLowerCase();
          bv = (bn ? `${bn.firstname} ${bn.lastname}` : '').toLowerCase();
          break;
        }
        default:
          av = (a[sortKey] || '').toString().toLowerCase();
          bv = (b[sortKey] || '').toString().toLowerCase();
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [searched, selectedEngineer, selectedPhase, selectedCompany, fromSec, toSec, sortKey, sortDir, user.map]);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }
  function sortIndicator(key: SortKey) {
    if (sortKey !== key) return '';
    return sortDir === 'asc' ? ' \u25B2' : ' \u25BC';
  }

  const phaseCounts = OPEN_PHASES.reduce<Record<string, number>>((acc, p) => {
    acc[p] = filteredRows.filter(r => r.phase === p).length;
    return acc;
  }, {});

  const allVisibleSelected = filteredRows.length > 0 && filteredRows.every(r => selectedIds.has(r.id));
  function toggleSelectAll() {
    setSelectedIds(allVisibleSelected ? new Set() : new Set(filteredRows.map(r => r.id)));
  }
  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function bulkReassign() {
    if (!bulkEngineer || selectedIds.size === 0) return;
    setBulkBusy(true);
    try {
      await hailer!.activity.update(
        Array.from(selectedIds).map(id => ({ _id: id, fields: { [FIELD_SUPPORT_ENGINEER]: bulkEngineer } })),
        {},
      );
      toast({ title: `Reassigned ${selectedIds.size} ticket${selectedIds.size === 1 ? '' : 's'}`, status: 'success', duration: 3000 });
      setSelectedIds(new Set());
      setBulkEngineer('');
      onRefresh?.();
      load();
    } catch (err) {
      toast({ title: 'Could not reassign tickets', description: String(err), status: 'error', duration: 4000 });
    }
    setBulkBusy(false);
  }

  async function bulkClose() {
    if (selectedIds.size === 0) return;
    setBulkBusy(true);
    try {
      await hailer!.activity.update(
        Array.from(selectedIds).map(id => ({ _id: id, phaseId: PHASE_DONE })),
        {},
      );
      toast({ title: `Closed ${selectedIds.size} ticket${selectedIds.size === 1 ? '' : 's'}`, status: 'success', duration: 3000 });
      setSelectedIds(new Set());
      onRefresh?.();
      load();
    } catch (err) {
      toast({ title: 'Could not close tickets', description: String(err), status: 'error', duration: 4000 });
    }
    setBulkBusy(false);
  }

  if (loading) return <Flex justify="center" align="center" h="200px"><Spinner size="xl" /></Flex>;
  if (error) return <Text color="red.500">Error loading data: {error}</Text>;

  return (
    <Box>
      {/* Filters */}
      <Flex gap={3} mb={2} wrap="wrap" align="center">
        <Flex align="center" gap={2}>
          <Text fontWeight="semibold" whiteSpace="nowrap" fontSize="sm">Engineer:</Text>
          <Select maxW="200px" size="sm" value={selectedEngineer} onChange={e => setSelectedEngineer(e.target.value)}>
            <option value="all">All Engineers</option>
            <option value={UNASSIGNED}>Unassigned</option>
            {engineers.map(id => {
              const u = user.map[id];
              return <option key={id} value={id}>{u ? `${u.firstname} ${u.lastname}` : id}</option>;
            })}
          </Select>
        </Flex>
        <Select maxW="180px" size="sm" value={selectedPhase} onChange={e => setSelectedPhase(e.target.value)}>
          <option value={ALL_PHASES}>{ALL_PHASES}</option>
          {OPEN_PHASES.map(p => <option key={p} value={p}>{p}</option>)}
        </Select>
        <Select maxW="200px" size="sm" value={selectedCompany} onChange={e => setSelectedCompany(e.target.value)}>
          <option value={ALL_COMPANIES}>{ALL_COMPANIES}</option>
          {companies.map(c => <option key={c} value={c}>{c}</option>)}
        </Select>
        <Input maxW="240px" size="sm" placeholder="Search ticket, company, issue…" value={search}
          onChange={e => setSearch(e.target.value)} />
        <Flex align="center" gap={1}>
          <Text fontSize="xs" color={mutedText} whiteSpace="nowrap">Received:</Text>
          <Input type="date" size="sm" maxW="150px" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          <Text fontSize="xs" color={mutedText}>–</Text>
          <Input type="date" size="sm" maxW="150px" value={dateTo} onChange={e => setDateTo(e.target.value)} />
        </Flex>
      </Flex>
      <Text fontSize="xs" color={mutedText} mb={4}>
        Showing {filteredRows.length} of {rows.length} open ticket{rows.length === 1 ? '' : 's'}.
      </Text>

      <SimpleGrid columns={{ base: 2, md: 3, lg: 6 }} spacing={3} mb={4}>
        {OPEN_PHASES.map(p => (
          <Box key={p} p={3} bg={cardBg} borderRadius="md" shadow="sm" border="1px" borderColor={borderColor}
            borderTop="3px solid" borderTopColor={`${ST_PHASE_COLOR[p] || 'gray'}.400`}>
            <Stat>
              <StatLabel fontSize="xs" noOfLines={2}>{p}</StatLabel>
              <StatNumber>{phaseCounts[p]}</StatNumber>
            </Stat>
          </Box>
        ))}
      </SimpleGrid>

      <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4} mb={5}>
        <Box p={4} bg={cardBg} borderRadius="md" shadow="sm" border="1px" borderColor={borderColor}>
          <Stat>
            <StatLabel>Total Open Tickets</StatLabel>
            <StatNumber>{filteredRows.length}</StatNumber>
            <StatHelpText>Across all active phases</StatHelpText>
          </Stat>
        </Box>
        <Box p={4} bg={cardBg} borderRadius="md" shadow="sm" border="1px" borderColor={borderColor}>
          <Stat>
            <StatLabel>Avg Resolution Time</StatLabel>
            <StatNumber>{avgDays !== null ? `${avgDays} days` : '—'}</StatNumber>
            <StatHelpText>Based on {resolvedCount} resolved ticket{resolvedCount !== 1 ? 's' : ''}</StatHelpText>
          </Stat>
        </Box>
      </SimpleGrid>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <Flex align="center" gap={3} p={3} mb={3} bg={bulkBarBg} borderRadius="md" wrap="wrap">
          <Text fontSize="sm" fontWeight="semibold">{selectedIds.size} selected</Text>
          <Select size="sm" maxW="200px" placeholder="Reassign to…" value={bulkEngineer}
            onChange={e => setBulkEngineer(e.target.value)}>
            {Object.values(user.map).sort((a, b) => `${a.firstname} ${a.lastname}`.localeCompare(`${b.firstname} ${b.lastname}`))
              .map(u => <option key={u._id} value={u._id}>{u.firstname} {u.lastname}</option>)}
          </Select>
          <Button size="sm" colorScheme="blue" isDisabled={!bulkEngineer} isLoading={bulkBusy} onClick={bulkReassign}>
            Apply Reassign
          </Button>
          <Button size="sm" colorScheme="green" isLoading={bulkBusy} onClick={bulkClose}>
            Close Selected
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>Clear Selection</Button>
        </Flex>
      )}

      {filteredRows.length === 0 ? (
        <Text color="gray.500">No open support tickets match these filters.</Text>
      ) : (
        <Box overflowX="auto" border="1px" borderColor={borderColor} borderRadius="md">
          <Table variant="simple" size="sm">
            <Thead bg={theadBg}>
              <Tr>
                <Th px={2}>
                  <Checkbox isChecked={allVisibleSelected} onChange={toggleSelectAll} />
                </Th>
                <Th cursor="pointer" onClick={() => handleSort('priority')} userSelect="none">Priority{sortIndicator('priority')}</Th>
                <Th>Inbox Folder</Th>
                <Th cursor="pointer" onClick={() => handleSort('ticketCode')} userSelect="none">Code{sortIndicator('ticketCode')}</Th>
                <Th cursor="pointer" onClick={() => handleSort('company')} userSelect="none">Company{sortIndicator('company')}</Th>
                <Th>Issue</Th>
                <Th cursor="pointer" onClick={() => handleSort('phase')} userSelect="none">Phase{sortIndicator('phase')}</Th>
                <Th cursor="pointer" onClick={() => handleSort('assignedEngineer')} userSelect="none">Assigned To{sortIndicator('assignedEngineer')}</Th>
                <Th cursor="pointer" onClick={() => handleSort('dateReceived')} userSelect="none">Date Received{sortIndicator('dateReceived')}</Th>
                <Th cursor="pointer" onClick={() => handleSort('daysOpen')} userSelect="none" isNumeric>Days Open{sortIndicator('daysOpen')}</Th>
                <Th>Billable</Th>
                <Th>Action</Th>
              </Tr>
            </Thead>
            <Tbody>
              {filteredRows.map(r => {
                const days = daysOpen(r.dateReceived);
                const color = agingColor(days);
                return (
                  <Tr key={r.id} _hover={{ bg: rowHover }}>
                    <Td px={2}>
                      <Checkbox isChecked={selectedIds.has(r.id)} onChange={() => toggleSelect(r.id)} />
                    </Td>
                    <Td whiteSpace="nowrap" cursor="pointer" onClick={() => hailer!.ui.activity.open(r.id)}>
                      {r.priority ? <Badge colorScheme={PRIORITY_COLOR[r.priority] || 'gray'}>{r.priority}</Badge> : '—'}
                    </Td>
                    <Td whiteSpace="nowrap" cursor="pointer" onClick={() => hailer!.ui.activity.open(r.id)}>
                      <Badge colorScheme={r.inboxFolderCreated === 'Yes' ? 'green' : 'red'}>
                        {r.inboxFolderCreated === 'Yes' ? 'Yes' : 'No'}
                      </Badge>
                    </Td>
                    <Td fontWeight="bold" whiteSpace="nowrap" cursor="pointer" onClick={() => hailer!.ui.activity.open(r.id)}>
                      {r.ticketCode || r.name}
                    </Td>
                    <Td maxW="160px" isTruncated cursor="pointer" onClick={() => hailer!.ui.activity.open(r.id)}>{r.company || '—'}</Td>
                    <Td maxW="260px" cursor="pointer" onClick={() => hailer!.ui.activity.open(r.id)}>
                      <Text isTruncated fontSize="sm" title={r.issues || ''}>{r.issues || '—'}</Text>
                    </Td>
                    <Td whiteSpace="nowrap" cursor="pointer" onClick={() => hailer!.ui.activity.open(r.id)}>
                      <Badge colorScheme={ST_PHASE_COLOR[r.phase] || 'gray'}>{r.phase || '—'}</Badge>
                    </Td>
                    <Td whiteSpace="nowrap" cursor="pointer" onClick={() => hailer!.ui.activity.open(r.id)}>
                      {r.assignedEngineer
                        ? (() => { const u = user.map[r.assignedEngineer!]; return u ? `${u.firstname} ${u.lastname}` : r.assignedEngineer; })()
                        : <Text as="span" color={mutedText}>Unassigned</Text>}
                    </Td>
                    <Td whiteSpace="nowrap" cursor="pointer" onClick={() => hailer!.ui.activity.open(r.id)}>{fmtDate(r.dateReceived)}</Td>
                    <Td isNumeric cursor="pointer" onClick={() => hailer!.ui.activity.open(r.id)}>
                      {days === null ? '—' : color ? <Badge colorScheme={color}>{days}d</Badge> : `${days}d`}
                    </Td>
                    <Td whiteSpace="nowrap" cursor="pointer" onClick={() => hailer!.ui.activity.open(r.id)}>
                      {r.billable ? (
                        <Badge colorScheme={r.billable === 'Yes' ? 'green' : 'gray'}>{r.billable}</Badge>
                      ) : '—'}
                    </Td>
                    <Td whiteSpace="nowrap">
                      <Button
                        size="xs"
                        variant="outline"
                        colorScheme="blue"
                        onClick={(e) => { e.stopPropagation(); setTripSourceTicket(r); openTripModal(); }}
                      >
                        + Trip
                      </Button>
                    </Td>
                  </Tr>
                );
              })}
            </Tbody>
           </Table>
        </Box>
      )}

      <NewCaseModal
        isOpen={isTripModalOpen}
        onClose={() => { closeTripModal(); setTripSourceTicket(null); }}
        onSuccess={() => { onRefresh?.(); load(); }}
        sourceTicket={tripSourceTicket ? { id: tripSourceTicket.id, customerId: tripSourceTicket.customerId } : undefined}
      />
    </Box>
  );
}
