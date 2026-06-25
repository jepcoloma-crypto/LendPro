import { useState, useEffect, useCallback } from 'react';
import { Calendar, Panel, Tag, Badge, Button, SelectPicker, toaster, Message, Modal } from 'rsuite';
import { calendarApi, usersApi } from '../../services/api';
import { formatCurrency } from '../../utils/format';
import { CalendarDays, MapPin, DollarSign, Bell } from 'lucide-react';

type CalendarEvent = {
  id: string;
  event_type: 'visit' | 'promise' | 'due';
  event_date: string;
  borrower_name: string;
  loan_number: string;
  visit_type?: string;
  result?: string;
  notes?: string;
  promise_to_pay_amount?: number;
  total_due?: number;
  paid_amount?: number;
  status?: string;
  installment_no?: number;
  collector_id?: string;
};

export const CalendarPage = () => {
  const [collectors, setCollectors] = useState<any[]>([]);
  const [collectorId, setCollectorId] = useState<string | undefined>(undefined);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [detailOpen, setDetailOpen] = useState(false);
  const [dayEvents, setDayEvents] = useState<CalendarEvent[]>([]);
  const [month, setMonth] = useState<Date>(new Date());

  useEffect(() => {
    usersApi.getCollectors().then(({ data }) =>
      setCollectors(data.data || [])
    ).catch(() => {});
  }, []);

  const fetchEvents = useCallback(async (start: Date, end: Date) => {
    setLoading(true);
    try {
      const params: any = {
        start: start.toISOString().slice(0, 10),
        end: end.toISOString().slice(0, 10),
      };
      if (collectorId) params.collectorId = collectorId;
      const { data } = await calendarApi.getEvents(params);
      const all: CalendarEvent[] = [
        ...(data.data.visits || []),
        ...(data.data.promises || []),
        ...(data.data.dueDates || []),
      ];
      setEvents(all);
    } catch { toaster.push(<Message type="error">Failed to load events</Message>, { placement: 'topEnd' }); }
    finally { setLoading(false); }
  }, [collectorId]);

  useEffect(() => {
    const start = new Date(month.getFullYear(), month.getMonth(), 1);
    const end = new Date(month.getFullYear(), month.getMonth() + 1, 0, 23, 59, 59);
    fetchEvents(start, end);
  }, [month, fetchEvents]);

  // Auto-navigate to month with nearest upcoming event when collector filter changes
  useEffect(() => {
    if (!collectorId) return;
    const now = new Date();
    const wideEnd = new Date(now.getFullYear() + 1, now.getMonth(), 0, 23, 59, 59);
    calendarApi.getEvents({
      start: now.toISOString().slice(0, 10),
      end: wideEnd.toISOString().slice(0, 10),
      collectorId,
    }).then(({ data }) => {
      const all: CalendarEvent[] = [
        ...(data.data.visits || []),
        ...(data.data.promises || []),
        ...(data.data.dueDates || []),
      ];
      if (all.length === 0) return;
      const earliest = all.reduce((a, b) => new Date(a.event_date) < new Date(b.event_date) ? a : b);
      const target = new Date(earliest.event_date);
      if (target.getMonth() !== month.getMonth() || target.getFullYear() !== month.getFullYear()) {
        setMonth(target);
      }
    }).catch(() => {});
  }, [collectorId]);

  const getEventsForDate = (date: Date): CalendarEvent[] =>
    events.filter(e => {
      const d = new Date(e.event_date);
      return d.getFullYear() === date.getFullYear() && d.getMonth() === date.getMonth() && d.getDate() === date.getDate();
    });

  const openDayDetail = (date: Date) => {
    setSelectedDate(date);
    setDayEvents(getEventsForDate(date));
    setDetailOpen(true);
  };

  const eventIcon = (type: string) => {
    switch (type) {
      case 'visit': return <MapPin className="w-3 h-3" />;
      case 'promise': return <Bell className="w-3 h-3" />;
      case 'due': return <DollarSign className="w-3 h-3" />;
      default: return null;
    }
  };

  const renderCell = (date: Date) => {
    const dayEvents = getEventsForDate(date);
    if (dayEvents.length === 0) return null;
    const visits = dayEvents.filter(e => e.event_type === 'visit').length;
    const promises = dayEvents.filter(e => e.event_type === 'promise').length;
    const dues = dayEvents.filter(e => e.event_type === 'due').length;
    return (
      <div className="flex gap-0.5 mt-1 justify-center">
        {visits > 0 && <Badge color="violet" content={visits} />}
        {promises > 0 && <Badge color="orange" content={promises} />}
        {dues > 0 && <Badge color="red" content={dues} />}
      </div>
    );
  };

  const eventTypeLabel = (type: string) => {
    const map: Record<string, { label: string; color: 'violet' | 'orange' | 'red' }> = {
      visit: { label: 'Visit', color: 'violet' },
      promise: { label: 'Promise', color: 'orange' },
      due: { label: 'Due', color: 'red' },
    };
    return map[type] || { label: type, color: 'blue' };
  };

  const eventResultColor = (result?: string) => {
    const colors: Record<string, 'green' | 'red' | 'orange' | 'blue'> = {
      collected: 'green', partial: 'orange', promise: 'blue', 'no-contact': 'red', refused: 'red',
    };
    return colors[result || ''] || 'blue';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Calendar</h1>
          <p className="text-gray-500 dark:text-gray-400">View visits, promises, and due dates</p>
        </div>
        <div className="w-64">
          <SelectPicker
            placeholder="Filter by collector" data={collectors.map(c => ({ label: `${c.first_name} ${c.last_name}`, value: c.id }))}
            style={{ width: '100%' }} cleanable onChange={(v: string | null) => setCollectorId(v || undefined)}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="flex items-center gap-2 text-sm text-violet-600 dark:text-violet-400"><MapPin className="w-4 h-4" /> Visits</div>
        <div className="flex items-center gap-2 text-sm text-orange-600 dark:text-orange-400"><Bell className="w-4 h-4" /> Promises</div>
        <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400"><DollarSign className="w-4 h-4" /> Due Dates</div>
      </div>

      <Panel className="bg-white dark:bg-gray-800 rounded-xl shadow-sm" bordered>
        <Calendar
          compact={false}
          defaultValue={new Date()}
          onChangeMonth={(d: Date) => setMonth(d)}
          onSelect={openDayDetail}
          renderCell={renderCell}
          style={{ width: '100%' }}
        />
      </Panel>

      <Modal open={detailOpen} onClose={() => setDetailOpen(false)} size="md">
        <Modal.Header>
          <Modal.Title>
            <div className="flex items-center gap-2">
              <CalendarDays className="w-5 h-5" />
              <span>Events for {selectedDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
            </div>
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {dayEvents.length === 0 ? (
            <p className="text-gray-400 text-center py-8">No events on this date</p>
          ) : (
            <div className="space-y-3">
              {dayEvents.map(e => {
                const type = eventTypeLabel(e.event_type);
                return (
                  <div key={`${e.event_type}-${e.id}`} className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700">
                    <div className="mt-0.5">{eventIcon(e.event_type)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Tag color={type.color}>{type.label}</Tag>
                        {e.event_type === 'visit' && e.result && <Tag color={eventResultColor(e.result)}>{e.result}</Tag>}
                        {(e.event_type === 'due' || e.event_type === 'promise') && <span className="text-sm font-semibold">{formatCurrency(e.event_type === 'promise' ? e.promise_to_pay_amount : e.total_due)}</span>}
                      </div>
                      <p className="text-sm font-medium mt-1">{e.borrower_name}</p>
                      <p className="text-xs text-gray-500">Loan: {e.loan_number}{e.installment_no ? ` · Installment #${e.installment_no}` : ''}</p>
                      {e.notes && <p className="text-xs text-gray-400 mt-1">{e.notes}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button onClick={() => setDetailOpen(false)} appearance="subtle">Close</Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};
