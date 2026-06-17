import { ReactNode } from 'react';
import { Table, Panel, Pagination } from 'rsuite';

const { Column, HeaderCell, Cell } = Table;

type ColumnDef = {
  width?: number;
  flexGrow?: number;
  fixed?: boolean | 'left' | 'right';
  header: string;
  dataKey?: string;
  cell?: (row: any) => ReactNode;
  align?: 'left' | 'center' | 'right';
};

interface DataTableProps {
  data: any[];
  loading: boolean;
  columns: ColumnDef[];
  page?: number;
  total?: number;
  limit?: number;
  onPageChange?: (page: number) => void;
  height?: number;
  rowHeight?: number;
}

export const DataTable = ({ data, loading, columns, page, total, limit = 20, onPageChange, height = 500, rowHeight = 50 }: DataTableProps) => (
  <Panel className="bg-white dark:bg-gray-800 rounded-xl shadow-sm" bordered>
    <Table data={data} loading={loading} height={height} rowHeight={rowHeight}>
      {columns.map((col, i) => (
        <Column key={i} width={col.width} flexGrow={col.flexGrow} fixed={col.fixed} align={col.align}>
          <HeaderCell>{col.header}</HeaderCell>
          {col.cell ? <Cell>{(row: any) => col.cell!(row)}</Cell> : <Cell dataKey={col.dataKey} />}
        </Column>
      ))}
    </Table>
    {page !== undefined && total !== undefined && onPageChange && (
      <div className="flex justify-center mt-4">
        <Pagination prev next first last pages={3} activePage={page} total={total} limit={limit} onChangePage={onPageChange} />
      </div>
    )}
  </Panel>
);
