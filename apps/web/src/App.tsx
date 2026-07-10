// eslint-disable-next-line no-restricted-imports -- legacy antd demo; removed in M0 task 8.2
import { Alert, Card, Spin, Table, Typography } from "antd";
import type { Invoice } from "@erp/contracts";
import { api } from "./api/client";

const { Title, Text } = Typography;

export function App() {
  const health = api.health.check.useQuery(["health"]);
  const invoices = api.invoices.list.useQuery(["invoices"]);

  return (
    <div style={{ maxWidth: 720, margin: "40px auto", padding: 16 }}>
      <Title level={2}>ERP — Monorepo skeleton</Title>

      <Card title="API health" size="small" style={{ marginBottom: 16 }}>
        {health.isLoading ? (
          <Spin />
        ) : health.isError ? (
          <Alert type="error" message="API unreachable — is apps/api running?" />
        ) : (
          <Text>
            status: <b>{health.data?.body.status}</b> · uptime:{" "}
            {health.data?.body.uptime.toFixed(1)}s
          </Text>
        )}
      </Card>

      <Card title="Invoices" size="small">
        {invoices.isLoading ? (
          <Spin />
        ) : invoices.isError ? (
          <Alert type="error" message="Failed to load invoices" />
        ) : (
          <Table<Invoice>
            rowKey="id"
            size="small"
            pagination={false}
            dataSource={invoices.data?.body.items ?? []}
            locale={{ emptyText: "No invoices yet — POST /api/invoices to create one" }}
            columns={[
              { title: "Number", dataIndex: "number" },
              { title: "VAT mode", dataIndex: "vatMode" },
              { title: "Total", dataIndex: "total" },
            ]}
          />
        )}
      </Card>
    </div>
  );
}
