import { ReactNode } from 'react';
import { Table } from 'rsuite';
import { useMediaQuery } from '../hooks/useMediaQuery';

interface ColumnDef {
  key: string;
  label: string;
  width: number;
  hide?: 'sm' | 'md' | 'lg';
  fixed?: boolean;
  cell?: (row: any) => ReactNode;
  dataKey?: string;
}

interface Props {
  data: any[];
  columns: ColumnDef[];
  loading?: boolean;
  height?: number;
  rowHeight?: number;
  onRowClick?: (row: any) => void;
}

export const ResponsiveTable = ({ data, columns, loading, height = 450, rowHeight = 50, onRowClick }: Props) => {
  const isSm = useMediaQuery('(max-width: 640px)');
  const isMd = useMediaQuery('(max-width: 768px)');
  const isLg = useMediaQuery('(max-width: 1024px)');

  const visibleColumns = columns.filter(c => {
    if (c.hide === 'sm' && isSm) return false;
    if (c.hide === 'md' && isMd) return false;
    if (c.hide === 'lg' && isLg) return false;
    return true;
  });

  return (
    <div className="overflow-x-auto">
      <Table data={data} loading={loading} height={height} rowHeight={rowHeight} onRowClick={onRowClick} autoHeight={data.length < 10}>
        {visibleColumns.map(col => (
          <Table.Column key={col.key} width={col.width} fixed={col.fixed as any}>
            <Table.HeaderCell>{col.label}</Table.HeaderCell>
            {col.cell ? <Table.Cell>{(row: any) => col.cell!(row)}</Table.Cell> : <Table.Cell dataKey={col.dataKey || col.key} />}
          </Table.Column>
        ))}
      </Table>
    </div>
  );
};
