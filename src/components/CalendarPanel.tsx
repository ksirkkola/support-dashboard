import {
  Box, Flex, Heading, Spinner, Text, Badge, useColorModeValue,
  SimpleGrid, IconButton, HStack, VStack,
} from '@chakra-ui/react';
import { useEffect, useState, useMemo } from 'react';
import { useApp } from '../hailer/use-app';

const INSIGHT_TRIPS = '6a4b93ac98da2dba3ba0bbf2';

// Conference workflow constants
const CONF_WORKFLOW = '6a192ecf0965f762b3ea50b9';
const CONF_PHASES   = [
  '6a192ed10965f762b3ea50e9', // New Conference
  '6a192ed10965f762b3ea50eb', // Done
  '6a192ed10965f762b3ea50ed', // ROI Review
  '6a192ed10965f762b3ea50ee', // Pre-event Outreach
  '6a192ed10965f762b3ea50ef', // Planning
  '6a192fd00965f762b3ea5f32', // Onsite Execution
  '6a192fdd0965f762b3ea604f', // Follow-up
];
const CONF_FIELD_DATES = '6a1c5c80c063208b5c4a4746'; // daterange
const CONF_FIELD_CODE  = '6a192ed10965f762b3ea5102';
const CONF_FIELD_LOC   = '6a1c5ccac063208b5c4a47dd';

interface CalEvent {
  id: string;
  startDate: Date;
  endDate: Date;
  label: string;
  sublabel: string;
  traveler: string;
  initials: string;
  type: 'trip' | 'conference';
  phase: string;
}

interface FieldValue {
  fieldName: string;
  value: unknown;
}

interface Activity {
  _id: string;
  name: string;
  phaseId: string;
  currentPhase?: string;
  fields?: Record<string, unknown>;
}

function parseInsight(data: { headers: string[]; rows: unknown[][] }): Record<string, unknown>[] {
  return data.rows.map(row => {
    const r: Record<string, unknown> = {};
    data.headers.forEach((h, i) => { r[h] = row[i]; });
    return r;
  });
}

// Insight timestamps are in seconds
function secToDate(val: unknown): Date | null {
  if (!val) return null;
  const n = Number(val);
  if (isNaN(n) || n === 0) return null;
  return new Date(n * 1000);
}

// SDK timestamps are in milliseconds
function msToDate(val: unknown): Date | null {
  if (!val) return null;
  const n = Number(val);
  if (isNaN(n) || n === 0) return null;
  return new Date(n);
}

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAY_NAMES   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

interface Props { refreshKey?: number }
export default function CalendarPanel({ refreshKey = 0 }: Props) {
  const { hailer, inside, user } = useApp();
  const [tripsRows, setTripsRows]   = useState<Record<string, unknown>[]>([]);
  const [confEvents, setConfEvents] = useState<CalEvent[]>([]);

  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [currentDate, setCurrentDate] = useState(new Date());

  const cardBg      = useColorModeValue('white', 'gray.700');
  const borderColor = useColorModeValue('gray.200', 'gray.600');
  const todayBg     = useColorModeValue('blue.50', 'blue.900');
  const headerBg    = useColorModeValue('gray.50', 'gray.800');
  const mutedText   = useColorModeValue('gray.400', 'gray.500');

  useEffect(() => {
    if (!inside) return;
    setLoading(true);

    Promise.all([
      hailer!.insight.data(INSIGHT_TRIPS, { update: true }),

      Promise.all(
        CONF_PHASES.map(phaseId =>
          hailer!.activity.list(CONF_WORKFLOW, phaseId, { limit: 200 }).catch(() => [])
        )
      ),
    ]).then(([trips, confResults]) => {
      setTripsRows(parseInsight(trips));

      const allConf = confResults.flat() as Activity[];
      const events: CalEvent[] = [];

      for (const a of allConf) {
        const datesField = a.fields?.[CONF_FIELD_DATES] as { start?: number; end?: number } | null;
        if (!datesField || !datesField.start) continue;

        const startDate = msToDate(datesField.start);
        const endDate   = msToDate(datesField.end || datesField.start);
        if (!startDate || !endDate) continue;

        const codeField = a.fields?.[CONF_FIELD_CODE] as string || '';
        const locField  = a.fields?.[CONF_FIELD_LOC] as string || '';

        events.push({
          id: a._id,
          startDate,
          endDate,
          label: a.name,
          sublabel: locField,
          traveler: '',
          initials: '',
          type: 'conference',
          phase: a.phaseId || a.currentPhase || '',
        });
      }

      setConfEvents(events);
      setLoading(false);
    }).catch(err => {
      setError(String(err));
      setLoading(false);
    });
  }, [inside, refreshKey]);

  // Build TRIPS events
  const tripEvents = useMemo<CalEvent[]>(() => {
    return tripsRows
      .map(r => {
        const startDate = secToDate(r.arrivalDate);
        if (!startDate) return null;
        const days = Math.max(1, Number(r.daysOnsite) || 1);
        const endDate = new Date(startDate.getTime() + (days - 1) * 24 * 60 * 60 * 1000);
        const traveler = r.assignedTraveler as string | null;
        const u = traveler ? user.map[traveler] : null;
        const name = u ? `${u.firstname} ${u.lastname}` : '';
        const initials = u ? `${u.firstname?.[0] || ''}${u.lastname?.[0] || ''}`.toUpperCase() : '';
        return {
          id: r.id as string,
          startDate,
          endDate,
          label: r.name as string || '',
          sublabel: String(r.serviceType || ''),
          traveler: name,
          initials,
          type: 'trip' as const,
          phase: r.phase as string,
        };
      })
      .filter(Boolean) as CalEvent[];
  }, [tripsRows, user.map]);

  const allEvents = useMemo(() =>
    [...tripEvents, ...confEvents]
      .sort((a, b) => a.startDate.getTime() - b.startDate.getTime()),
    [tripEvents, confEvents]);

  // Calendar grid
  const year  = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay    = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();

  // Events that span or start on a given day
  const eventsForDay = (day: number) => allEvents.filter(e => {
    const cellDate = new Date(year, month, day);
    return cellDate >= new Date(e.startDate.getFullYear(), e.startDate.getMonth(), e.startDate.getDate()) &&
           cellDate <= new Date(e.endDate.getFullYear(), e.endDate.getMonth(), e.endDate.getDate());
  });

  const todayStart = new Date(new Date().setHours(0,0,0,0));
  const upcoming = allEvents.filter(e => e.endDate >= todayStart);

  function fmtDateRange(e: CalEvent): string {
    const s = e.startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    if (e.startDate.toDateString() === e.endDate.toDateString()) return s;
    const end = e.endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return `${s} – ${end}`;
  }

  if (loading) return <Flex justify="center" align="center" h="300px"><Spinner size="xl" /></Flex>;
  if (error)   return <Text color="red.500">Error: {error}</Text>;

  return (
    <Box>
      <SimpleGrid columns={{ base: 1, lg: 3 }} spacing={6}>

        {/* Calendar grid */}
        <Box gridColumn={{ lg: 'span 2' }} bg={cardBg} border="1px" borderColor={borderColor} borderRadius="md" shadow="sm" overflow="hidden">
          <Flex bg={headerBg} px={4} py={3} align="center" justify="space-between" borderBottom="1px" borderColor={borderColor}>
            <IconButton aria-label="Previous" size="sm" variant="ghost" onClick={() => setCurrentDate(new Date(year, month - 1, 1))} icon={<Text>◀</Text>} />
            <Heading size="md">{MONTH_NAMES[month]} {year}</Heading>
            <IconButton aria-label="Next" size="sm" variant="ghost" onClick={() => setCurrentDate(new Date(year, month + 1, 1))} icon={<Text>▶</Text>} />
          </Flex>

          <SimpleGrid columns={7} bg={headerBg} borderBottom="1px" borderColor={borderColor}>
            {DAY_NAMES.map(d => (
              <Box key={d} textAlign="center" py={2} fontSize="xs" fontWeight="bold" color={mutedText}>{d}</Box>
            ))}
          </SimpleGrid>

          <SimpleGrid columns={7} spacing={0}>
            {Array.from({ length: firstDay }).map((_, i) => (
              <Box key={`e${i}`} minH="80px" border="1px" borderColor={borderColor} opacity={0.3} />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;
              const dayEvents = eventsForDay(day);
              return (
                <Box key={day} minH="80px" border="1px" borderColor={borderColor} bg={isToday ? todayBg : undefined} p={1}>
                  <Text fontSize="xs" fontWeight={isToday ? 'bold' : 'normal'} color={isToday ? 'blue.500' : undefined} mb={1}>{day}</Text>
                  <VStack spacing={1} align="stretch">
                    {dayEvents.map(e => (
                      <Box key={e.id} px={1} py={0.5} borderRadius="sm" fontSize="xs"
                        bg={e.type === 'trip' ? 'purple.100' : 'teal.100'}
                        color={e.type === 'trip' ? 'purple.800' : 'teal.800'}
                        cursor="pointer"
                        onClick={() => hailer!.ui.activity.open(e.id)}
                        title={e.traveler ? `${e.label} — ${e.traveler}` : `${e.label} · ${e.sublabel}`}>
                        <Flex align="center" justify="space-between" gap={1}>
                          <Text isTruncated fontSize="xs">{e.label}</Text>
                          {e.initials && (
                            <Box flexShrink={0} w={4} h={4} borderRadius="full"
                              bg="purple.400" color="white"
                              fontSize="8px" fontWeight="bold"
                              display="flex" alignItems="center" justifyContent="center">
                              {e.initials}
                            </Box>
                          )}
                        </Flex>
                      </Box>
                    ))}
                  </VStack>
                </Box>
              );
            })}
          </SimpleGrid>
        </Box>

        {/* Upcoming sidebar */}
        <Box>
          <Heading size="sm" mb={3} color="gray.500" textTransform="uppercase" letterSpacing="wide">Upcoming</Heading>
          <VStack spacing={3} align="stretch">
            {upcoming.length === 0 ? (
              <Text color="gray.500" fontSize="sm">No upcoming events.</Text>
            ) : (
              upcoming.slice(0, 5).map(e => (
                <Box key={e.id} bg={cardBg} border="1px" borderColor={borderColor}
                  borderLeft="4px solid"
                  borderLeftColor={e.type === 'trip' ? 'purple.400' : 'teal.400'}
                  borderRadius="md" p={3} cursor="pointer" shadow="sm"
                  onClick={() => hailer!.ui.activity.open(e.id)}>
                  <HStack justify="space-between" mb={1}>
                    <Badge colorScheme={e.type === 'trip' ? 'purple' : 'teal'} fontSize="xs">
                      {e.type === 'trip' ? 'TRIP' : 'CONF'}
                    </Badge>
                    <Text fontSize="xs" color={mutedText}>{fmtDateRange(e)}</Text>
                  </HStack>
                  <Text fontSize="sm" fontWeight="medium" noOfLines={1}>{e.label}</Text>
                  {e.sublabel && <Text fontSize="xs" color={mutedText} noOfLines={1}>{e.sublabel}</Text>}
                  {e.traveler && (
                    <HStack mt={1} spacing={1}>
                      <Box w={5} h={5} borderRadius="full" bg="purple.400" color="white"
                        fontSize="9px" fontWeight="bold"
                        display="flex" alignItems="center" justifyContent="center">
                        {e.initials}
                      </Box>
                      <Text fontSize="xs" fontWeight="medium" color="purple.600">{e.traveler}</Text>
                    </HStack>
                  )}
                </Box>
              ))
            )}
          </VStack>
        </Box>
      </SimpleGrid>

      <HStack mt={4} spacing={4} flexWrap="wrap">
        <HStack><Box w={3} h={3} bg="purple.300" borderRadius="sm" /><Text fontSize="xs" color={mutedText}>TRIPS / IHS</Text></HStack>
        <HStack><Box w={3} h={3} bg="teal.300" borderRadius="sm" /><Text fontSize="xs" color={mutedText}>Conferences</Text></HStack>

      </HStack>
    </Box>
  );
}
