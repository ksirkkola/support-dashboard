import { useEffect, useState } from 'react';
import {
  Alert, AlertIcon, Button, FormControl, FormLabel, Input, Modal, ModalBody,
  ModalCloseButton, ModalContent, ModalFooter, ModalHeader, ModalOverlay,
  Select, Spinner, Text, Textarea, VStack, useToast,
} from '@chakra-ui/react';
import { Activity, ActivityFieldValue, HailerApi } from '@hailer/app-sdk';
import { useApp } from '../hailer/use-app';
import SearchableSelect from './SearchableSelect';

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

// TRIPS / IHS
const TRIPS_WORKFLOW = '6a211715b129621437c16b03';
const TRIPS_TRIAGE_PHASE = '6a211716b129621437c16b0e';
// Fields available for write at CREATE time — gated to what the Triage phase lists.
const TF_COMPANY = '6a211716b129621437c16b26'; // freeform textarea mirror
const TF_SERVICE_TYPE = '6a325f05506c8ccc619b0dbb';
const TF_DATE_RECEIVED = '6a211716b129621437c16b20';
const TF_ASSET_TEXT = '6a211716b129621437c16b23'; // required
const TF_CONTACT_PERSON = '6a799e8aef5cbedbd85d3631'; // activitylink, required
const TF_CONTACT_EMAIL = '6a75d1557163b2968df43e2f';
// Ticket Code (function-computed from the activity's sequence number) used
// to be required:true, which made create fail before the function ever got
// a chance to run — fixed at the workspace-config level (required:false).
// Nothing to send for it here; the function fills it in right after create.
// Fields NOT on the Triage phase — set via a follow-up update (create is
// phase-gated to Triage's field list; update is not).
const TF_CUSTOMER_LINK = '6a211716b129621437c16b16';
const TF_CLIENT_ISSUES = '6a211716b129621437c16b30';
// Freeform textarea, e.g. "2026" — the Support Dashboard's Trips/IHS tab
// groups and defaults its year filter off this field. Leaving it empty
// files a new case under an invisible "Unknown" bucket instead of the
// currently-selected year, making it look like creation silently failed.
const TF_YEAR_OF_SERVICE = '6a211716b129621437c16b36';
// Links the created trip back to the Support Ticket it was escalated from, when
// opened via the "+ Trip" quick action on a ticket row (Triage phase field, so
// it's safe to set at create time same as the rest of createFields).
const TF_SOURCE_SUPPORT_TICKET = '6aa7a8f1da23a46b38d34fe5';

const SERVICE_TYPES = ['Calibration', 'In House Service / Repair', 'Startup', 'Testing', 'Training'];

interface Option {
  _id: string;
  name: string;
}

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

function toDateInputValue(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}
function dateInputToMs(v: string): number {
  return v ? new Date(v).getTime() : Date.now();
}

// Hailer's own error message sometimes embeds raw objects (renders as
// "[object Object]" when coerced to a string) instead of field names — pull
// the structured debug/details payload instead so the real problem shows up.
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
    } catch {
      // ignore — fall through to whatever we already have
    }
  }
  return parts.length > 0 ? parts.join(' — ') : String(err);
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  // Set when opened via the "+ Trip" quick action on a Support Tickets row —
  // pre-fills the customer (when we can resolve it) and links the new trip
  // back to the ticket it was escalated from.
  sourceTicket?: { id: string; customerId: string | null };
}

// The gap this fills: Trips / IHS cases only ever got created via the
// Support Tickets triage flow (or by hand in Hailer) — there was no quick
// way to log a brand-new case straight from the dashboard. Same pattern as
// Manufacturing & Assembly's "+ Receive Stock": one modal, one submit,
// creates the record with the fields the Triage phase allows at create time,
// then a follow-up update fills in the rest (Customer link, issue notes).
export default function NewCaseModal({ isOpen, onClose, onSuccess, sourceTicket }: Props) {
  const { hailer } = useApp();
  const toast = useToast();

  const [customers, setCustomers] = useState<Option[]>([]);
  const [contacts, setContacts] = useState<(Option & { companyId: string | null; email: string })[]>([]);
  const [loadingLookups, setLoadingLookups] = useState(true);

  const [customerId, setCustomerId] = useState<string | null>(null);
  const [contactId, setContactId] = useState<string | null>(null);
  const [serviceType, setServiceType] = useState('Calibration');
  const [dateReceived, setDateReceived] = useState(toDateInputValue(Date.now()));
  const [assetText, setAssetText] = useState('');
  const [issues, setIssues] = useState('');
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
          customerRows
            .map((a) => ({ _id: a._id, name: a.name }))
            .sort((a, b) => a.name.localeCompare(b.name)),
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

  // Pre-fill the customer once the lookup list has loaded, when opened via the
  // "+ Trip" quick action on a ticket row. Best-effort: if the ticket's
  // customer link couldn't be resolved (older tickets, freeform company text
  // only), the field is simply left for manual selection.
  useEffect(() => {
    if (!isOpen || !sourceTicket?.customerId || customers.length === 0) return;
    if (customers.some((c) => c._id === sourceTicket.customerId)) {
      setCustomerId(sourceTicket.customerId);
    }
  }, [isOpen, sourceTicket, customers]);

  const selectedCustomer = customers.find((c) => c._id === customerId) || null;
  const contactsForCustomer = customerId ? contacts.filter((c) => c.companyId === customerId) : contacts;
  const selectedContact = contacts.find((c) => c._id === contactId) || null;

  function reset() {
    setCustomerId(null);
    setContactId(null);
    setServiceType('Calibration');
    setDateReceived(toDateInputValue(Date.now()));
    setAssetText('');
    setIssues('');
    setError(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleSubmit() {
    if (!hailer) return;
    if (!selectedCustomer) { setError('Pick a customer.'); return; }
    if (!selectedContact) { setError('Pick a client contact person.'); return; }
    if (!assetText.trim()) { setError('Describe the asset(s) needing service.'); return; }

    setSubmitting(true);
    setError(null);
    try {
      // 1. Create with only the fields the Triage phase allows at create time.
      // Hailer rejects "" with an opaque code 191 on EVERY field type,
      // regardless of required — omit optional fields entirely rather than
      // send an empty string (e.g. a contact with no email on file).
      const createFields: Record<string, ActivityFieldValue> = {
        [TF_SERVICE_TYPE]: serviceType,
        [TF_DATE_RECEIVED]: dateInputToMs(dateReceived),
        [TF_ASSET_TEXT]: assetText,
        [TF_CONTACT_PERSON]: selectedContact._id,
      };
      if (selectedCustomer.name.trim()) createFields[TF_COMPANY] = selectedCustomer.name;
      if (selectedContact.email.trim()) createFields[TF_CONTACT_EMAIL] = selectedContact.email;
      if (sourceTicket) createFields[TF_SOURCE_SUPPORT_TICKET] = sourceTicket.id;

      const created = await hailer.activity.create(
        TRIPS_WORKFLOW,
        [{ name: `${selectedCustomer.name} - ${serviceType}`, phaseId: TRIPS_TRIAGE_PHASE, fields: createFields }],
        {},
      );
      const newId = created?.[0]?._id;
      if (!newId) throw new Error('Case was not created — no ID returned.');

      // 2. Follow-up update for fields not on the Triage phase (the real
      // Customer link the rest of the business — including the Calibration
      // & Repair Quote Builder — relies on to find this customer's assets).
      const updateFields: Record<string, ActivityFieldValue> = {
        [TF_CUSTOMER_LINK]: selectedCustomer._id,
        [TF_YEAR_OF_SERVICE]: String(new Date(dateInputToMs(dateReceived)).getFullYear()),
      };
      if (issues.trim()) updateFields[TF_CLIENT_ISSUES] = issues;
      await hailer.activity.update([{ _id: newId, fields: updateFields }], {});

      toast({
        title: 'Case created',
        description: `${selectedCustomer.name} - ${serviceType}`,
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
        <ModalHeader>
          New Case (Trips / IHS)
          {sourceTicket && (
            <Text fontSize="xs" fontWeight="normal" color="gray.500" mt={1}>
              Escalating from Support Ticket — will link back automatically.
            </Text>
          )}
        </ModalHeader>
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
                    options={customers.map((c) => ({ _id: c._id, name: c.name }))}
                    placeholder="Search customers..."
                    allowClear
                  />
                </FormControl>

                <FormControl isRequired>
                  <FormLabel fontSize="sm">Client Contact Person</FormLabel>
                  <SearchableSelect
                    value={contactId}
                    onChange={setContactId}
                    options={contactsForCustomer.map((c) => ({ _id: c._id, name: c.name, badge: c.email || undefined }))}
                    placeholder={customerId ? 'Search contacts...' : 'Pick a customer first (or search all)'}
                    allowClear
                  />
                </FormControl>
              </>
            )}

            <FormControl isRequired>
              <FormLabel fontSize="sm">Service Type</FormLabel>
              <Select value={serviceType} onChange={(e) => setServiceType(e.target.value)}>
                {SERVICE_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </Select>
            </FormControl>

            <FormControl>
              <FormLabel fontSize="sm">Date Received</FormLabel>
              <Input type="date" value={dateReceived} onChange={(e) => setDateReceived(e.target.value)} />
            </FormControl>

            <FormControl isRequired>
              <FormLabel fontSize="sm">Asset(s) Needing Service</FormLabel>
              <Textarea
                value={assetText}
                onChange={(e) => setAssetText(e.target.value)}
                placeholder="e.g. 507-21 Foot, 506-27 Hand"
                rows={2}
              />
              <Text fontSize="xs" color="gray.500" mt={1}>
                Specific asset records get linked later, in Pre-Travel Activities.
              </Text>
            </FormControl>

            <FormControl>
              <FormLabel fontSize="sm">Client Identified Issues (optional)</FormLabel>
              <Textarea
                value={issues}
                onChange={(e) => setIssues(e.target.value)}
                placeholder="What did they reach out regarding?"
                rows={2}
              />
            </FormControl>
          </VStack>
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" mr={3} onClick={handleClose}>Cancel</Button>
          <Button colorScheme="green" onClick={handleSubmit} isLoading={submitting}>
            Create Case
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
