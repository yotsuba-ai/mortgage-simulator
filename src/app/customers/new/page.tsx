import { CustomerForm } from "@/components/CustomerForm";
import { PageHeader } from "@/components/PageHeader";

export default function NewCustomerPage() {
  return (
    <div>
      <PageHeader title="顧客を追加" />
      <CustomerForm />
    </div>
  );
}
