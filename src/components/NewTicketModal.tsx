import { useEffect, useMemo, useState } from 'react';
import {
  Alert, AlertIcon, Button, FormControl, FormLabel, HStack, Input, Modal, ModalBody,
  ModalCloseButton, ModalContent, ModalFooter, ModalHeader, ModalOverlay,
  Select, Spinner, Textarea, VStack, useToast,
} from '@chakra-ui/react';
import { Activity, ActivityFieldValue, HailerApi } from '@hailer/app-sdk';
import { useApp } from '../hailer/use-app';
import SearchableSelect from './SearchableSelect';
import {
  ST_FIELD_COMPANY, ST_FIELD_CUSTOMER_LINK, ST_PHASE_NEW_TICKET, WORKFLOW_SUPPORT_TICKETS,
} from '../constants/ids';

// Customers
const CUSTOMERS_WORKFLOW = '6a041d0ffc4db70b8339c891';
const CUSTOMERS_PHASE = '6a041d0ffc4db70b8339c89c';

// Contact persons
const CONTACTS_WORKFLOW = '6a041d0ffc4db70b8339c89a';
const CONTACTS_PHASE = '6a041d0ffc4db70b8339c8e5';
const CF_FIRST_NAME = '6a041d0ffc4db70b8339c8e0';
const CF_LAST_NAME = '6a041d0ffc4db70b8339c8e1';
const CF_EMAIL = '6a041d0ffc4db70b8339c8c5';
const CF_COMPANY = '6a041d0ffc4db70b8339c8e4';

// Support Ticket fields. Create is phase-gated to the New Ticket phase's field
// list (company, email, issues, request type, priority); the Customer link and
// Support Engineer are NOT on that phase, so they go in a follow-up update.
const SF_EMAIL = '6a0d634b9de2da901759c1f4';
const SF_ISSUES = '6a06e492112c3668ef86bbd9';
const SF_REQUEST_TYPE = '6a55f1567cb86e8e611e2065';
const SF_PRIORITY = '6a9a9e382913b623acec0631';
const SF_TICKET_CODE = '6a16d8cb36f4aee2608ab78f'; // function field: E + workflow sequence number
const SF_SUPPORT_ENGINEER = '6a06e492112c3668ef86bbdd';

const REQUEST_TYPES = ['Technical Support', 'Calibration Request', 'Research Request', 'Software Issue', 'Parts Order', 'Other'];
const PRIORITIES = ['Low', 'Normal', 'High', 'Urgent'];

interface Option { _id: string; name: string }
interface Contact extends Option { companyId: string | null; email: string }

async function listAll(hailer: HailerApi, workflowId: string, phaseId: string): Promise<Activity[]> {
  const all: Activity[] = [];
  let skip = 0;
  const pageSize = 200;
  for (;;) {
    const page = await hailer.activity.list(workflowId, phaseId, { limit: pageSize, skip });
    all.push(...page);
    if (page.length < pageSize) break;
    skip += pageSize;
    if (skip > 5000) break;
  }
  return all;
}

// Hailer's error messages sometimes embed raw objects ("[object Object]") —
// surface the structured details payload so the real problem shows up.
function formatHailerError(err: unknown): string {
  const e = err as { msg?: string; message?: string; debug?: unknown; details?: unknown };
  const parts: string[] = [];
  if (e?.msg) parts.push(e.msg);
  else if (e?.message) parts.push(e.message);
  const structured = e?.details ?? e?.debug;
  if (structured && typeof structured === 'object') {
    try {
      const json = JSON.stringify(structured);
      if (json && json !== '{}' && json !== '[]') parts.push(json);
    } catch { /* ignore */ }
  }
  return parts.length > 0 ? parts.join(' — ') : String(err);
}

// Ticket Code is a function field computed server-side from the activity's
// sequence number (next in line: E0103 after E0102, etc.). It appears a moment
// after create, so poll briefly. Returns null if it hasn't shown up; the ticket
// is still fine, it just keeps its plain name.
async function readTicketCode(hailer: HailerApi, activityId: string): Promise<string | null> {
  for (let attempt = 0; attempt < 6; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 800));
    const act = await hailer.activity.get(activityId).catch(() => undefined);
    const raw = act?.fields?.[SF_TICKET_CODE] as unknown;
    const value = raw && typeof raw === 'object' ? (raw as { value?: unknown }).value : raw;
    if (typeof value === 'string' && /^E[A-Za-z-]*\d+$/.test(value.trim())) return value.trim();
  }
  return null;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

// Quick "New Ticket" entry from the Support Tickets tab: one modal, one
// submit. Creates the ticket in the New Ticket phase, then a follow-up update
// sets the Customer link and (optional) Support Engineer.
export default function NewTicketModal({ isOpen, onClose, onSuccess }: Props) {
  const { hailer, user } = useApp();
  const toast = useToast();

  const [customers, setCustomers] = useState<Option[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loadingLookups, setLoadingLookups] = useState(true);

  const [customerId, setCustomerId] = useState<string | null>(null);
  const [contactId, setContactId] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [requestType, setRequestType] = useState('Technical Support');
  const [priority, setPriority] = useState('Normal');
  const [issues, setIssues] = useState('');
  const [engineerId, setEngineerId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !hailer) return;
    setLoadingLookups(true);
    Promise.all([
      listAll(hailer, CUSTOMERS_WORKFLOW, CUSTOMERS_PHASE),
      listAll(hailer, CONTACTS_WORKFLOW, CONTACTS_PHASE),
    ])
      .then(([customerRows, contactRows]) => {
        setCustomers(
          customerRows.map((a) => ({ _id: a._id, name: a.name })).sort((a, b) => a.name.localeCompare(b.name)),
        );
        setContacts(
          contactRows.map((a) => {
            const companyRaw = a.fields?.[CF_COMPANY];
            const companyId = Array.isArray(companyRaw)
              ? (companyRaw[0] as { _id?: string } | undefined)?._id ?? null
              : (companyRaw as { _id?: string } | undefined)?._id ?? null;
            const first = (a.fields?.[CF_FIRST_NAME] as string) || '';
            const last = (a.fields?.[CF_LAST_NAME] as string) || '';
            return {
              _id: a._id,
              name: `${first} ${last}`.trim() || a.name,
              companyId,
              email: (a.fields?.[CF_EMAIL] as string) || '',
            };
          }),
        );
      })
      .catch((err) => setError(formatHailerError(err)))
      .finally(() => setLoadingLookups(false));
  }, [isOpen, hailer]);

  const selectedCustomer = customers.find((c) => c._id === customerId) || null;
  const contactsForCustomer = customerId ? contacts.filter((c) => c.companyId === customerId) : contacts;
  const engineers = useMemo(
    () => Object.values(user.map).sort((a, b) => `${a.firstname} ${a.lastname}`.localeCompare(`${b.firstname} ${b.lastname}`)),
    [user.map],
  );

  function reset() {
    setCustomerId(null);
    setContactId(null);
    setEmail('');
    setRequestType('Technical Support');
    setPriority('Normal');
    setIssues('');
    setEngineerId('');
    setError(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  function handleContactChange(id: string) {
    setContactId(id);
    const c = contacts.find((x) => x._id === id);
    // Contact's email pre-fills but stays editable.
    if (c?.email) setEmail(c.email);
  }

  async function handleSubmit() {
    if (!hailer) return;
    if (!selectedCustomer) { setError('Pick a customer.'); return; }
    if (!issues.trim()) { setError('Describe the issue.'); return; }

    setSubmitting(true);
    setError(null);
    try {
      // Hailer rejects "" with an opaque code 191 on every field type — omit
      // optional fields entirely instead of sending empty strings.
      const createFields: Record<string, ActivityFieldValue> = {
        [SF_REQUEST_TYPE]: requestType,
        [SF_PRIORITY]: priority,
        [SF_ISSUES]: issues,
      };
      if (selectedCustomer.name.trim()) createFields[ST_FIELD_COMPANY] = selectedCustomer.name;
      if (email.trim()) createFields[SF_EMAIL] = email.trim();

      const created = await hailer.activity.create(
        WORKFLOW_SUPPORT_TICKETS,
        [{ name: `${selectedCustomer.name} - ${requestType}`, phaseId: ST_PHASE_NEW_TICKET, fields: createFields }],
        {},
      );
      const newId = created?.[0]?._id;
      if (!newId) throw new Error('Ticket was not created — no ID returned.');

      const updateFields: Record<string, ActivityFieldValue> = {
        [ST_FIELD_CUSTOMER_LINK]: selectedCustomer._id,
      };
      if (engineerId) updateFields[SF_SUPPORT_ENGINEER] = engineerId;
      await hailer.activity.update([{ _id: newId, fields: updateFields }], {});

      // Read the assigned ticket number back and lead the name with it, like
      // the older tickets ("E0099 - Aitex SPAIN: software error").
      const baseName = `${selectedCustomer.name} - ${requestType}`;
      const code = await readTicketCode(hailer, newId);
      if (code) await hailer.activity.update([{ _id: newId, name: `${code} - ${baseName}` }], {});

      toast({
        title: code ? `Ticket ${code} created` : 'Ticket created',
        description: baseName,
        status: 'success',
        duration: 3000,
        isClosable: true,
      });
      onSuccess();
      handleClose();
    } catch (err) {
      setError(formatHailerError(err));
    }
    setSubmitting(false);
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} size="md">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>New Support Ticket</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <VStack align="stretch" spacing={4}>
            {error && (
              <Alert status="error" borderRadius="md" fontSize="sm">
                <AlertIcon />
                {error}
              </Alert>
            )}

            {loadingLookups ? (
              <Spinner size="sm" />
            ) : (
              <>
                <FormControl isRequired>
                  <FormLabel fontSize="sm">Customer</FormLabel>
                  <SearchableSelect
                    value={customerId}
                    onChange={(id) => { setCustomerId(id); setContactId(null); }}
                    options={customers}
                    placeholder="Search customers..."
                    allowClear
                  />
                </FormControl>

                <FormControl>
                  <FormLabel fontSize="sm">Contact Person (optional)</FormLabel>
                  <SearchableSelect
                    value={contactId}
                    onChange={handleContactChange}
                    options={contactsForCustomer.map((c) => ({ _id: c._id, name: c.name, badge: c.email || undefined }))}
                    placeholder={customerId ? 'Search contacts...' : 'Pick a customer first (or search all)'}
                    allowClear
                  />
                </FormControl>

                <FormControl>
                  <FormLabel fontSize="sm">Email Address</FormLabel>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" />
                </FormControl>
              </>
            )}

            <HStack align="flex-start" spacing={3}>
              <FormControl isRequired>
                <FormLabel fontSize="sm">Request Type</FormLabel>
                <Select value={requestType} onChange={(e) => setRequestType(e.target.value)}>
                  {REQUEST_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </Select>
              </FormControl>
              <FormControl isRequired>
                <FormLabel fontSize="sm">Priority</FormLabel>
                <Select value={priority} onChange={(e) => setPriority(e.target.value)}>
                  {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                </Select>
              </FormControl>
            </HStack>

            <FormControl isRequired>
              <FormLabel fontSize="sm">Issue</FormLabel>
              <Textarea
                value={issues}
                onChange={(e) => setIssues(e.target.value)}
                placeholder="What did the client reach out regarding?"
                rows={4}
              />
            </FormControl>

            <FormControl>
              <FormLabel fontSize="sm">Assign To (optional)</FormLabel>
              <Select placeholder="Unassigned" value={engineerId} onChange={(e) => setEngineerId(e.target.value)}>
                {engineers.map((u) => <option key={u._id} value={u._id}>{u.firstname} {u.lastname}</option>)}
              </Select>
            </FormControl>
          </VStack>
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" mr={3} onClick={handleClose}>Cancel</Button>
          <Button colorScheme="blue" onClick={handleSubmit} isLoading={submitting}>
            Create Ticket
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
