import { useEffect } from 'react';
import {
  Box, Button, Flex, Heading, Spinner, Tab, TabList, TabPanel, TabPanels,
  Tabs, Text, useColorMode, useColorModeValue,
} from '@chakra-ui/react';
import { useApp } from './hailer/use-app';
import { useRefresh } from './hailer/use-refresh';
import CalendarPanel from './components/CalendarPanel';
import TripsPanel from './components/TripsPanel';
import SupportTicketsPanel from './components/SupportTicketsPanel';
import WorkOrdersPanel from './components/WorkOrdersPanel';
import ReferencePanel from './components/ReferencePanel';
import ThermDACPanel from './components/ThermDACPanel';
import TimeTrackingPanel from './components/TimeTrackingPanel';

export default function App() {
  const { api, inside, ready, settings } = useApp();
  const { setColorMode } = useColorMode();
  const { refreshKey, refresh, fmtLastUpdated } = useRefresh();

  const bg          = useColorModeValue('gray.50', 'gray.900');
  const headerBg    = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const mutedText   = useColorModeValue('gray.400', 'gray.500');

  useEffect(() => { void api.init(); }, [api]);

  useEffect(() => {
    if (settings?.theme === 'dark') setColorMode('dark');
    else if (settings?.theme) setColorMode('light');
  }, [settings, setColorMode]);

  if (!inside) return (
    <Flex h="100vh" align="center" justify="center">
      <Text color="gray.500">Open this app inside Hailer</Text>
    </Flex>
  );

  if (!ready) return (
    <Flex h="100vh" align="center" justify="center">
      <Spinner size="xl" />
    </Flex>
  );

  return (
    <Box minH="100vh" bg={bg}>
      <Box bg={headerBg} px={6} py={4} borderBottom="1px" borderColor={borderColor} mb={4}>
        <Flex align="center" justify="space-between">
          <Heading size="md">Support Dashboard</Heading>
          <Flex align="center" gap={3}>
            <Text fontSize="xs" color={mutedText}>Updated {fmtLastUpdated()}</Text>
            <Button size="sm" variant="outline" onClick={refresh}>↻ Refresh</Button>
          </Flex>
        </Flex>
      </Box>

      <Box px={6} pb={8}>
        <Tabs variant="enclosed" colorScheme="blue" isLazy>
          <TabList mb={4}>
            <Tab fontWeight="semibold">📖 Reference</Tab>
            <Tab fontWeight="semibold">Calendar</Tab>
            <Tab fontWeight="semibold">Work Orders</Tab>
            <Tab fontWeight="semibold">Trips / IHS</Tab>
            <Tab fontWeight="semibold">Support Tickets</Tab>
            <Tab fontWeight="semibold">ThermDAC</Tab>
            <Tab fontWeight="semibold">⏱️ Time Tracking</Tab>
          </TabList>

          <TabPanels>
            <TabPanel px={0}><ReferencePanel refreshKey={refreshKey} /></TabPanel>
            <TabPanel px={0}><CalendarPanel refreshKey={refreshKey} /></TabPanel>
            <TabPanel px={0}><WorkOrdersPanel refreshKey={refreshKey} /></TabPanel>
            <TabPanel px={0}><TripsPanel refreshKey={refreshKey} onCaseCreated={refresh} /></TabPanel>
            <TabPanel px={0}><SupportTicketsPanel refreshKey={refreshKey} onRefresh={refresh} /></TabPanel>
            <TabPanel px={0}><ThermDACPanel refreshKey={refreshKey} /></TabPanel>
            <TabPanel px={0}><TimeTrackingPanel refreshKey={refreshKey} onRefresh={refresh} /></TabPanel>
          </TabPanels>
        </Tabs>
      </Box>
    </Box>
  );
}
