import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { CustomerForm } from "@/components/CustomerForm";
import { PageHeader } from "@/components/PageHeader";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import { deleteCustomer } from "../../actions";

export const dynamic = "force-dynamic";

export default async function EditCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const customerId = Number(id);
  if (!Number.isInteger(customerId)) notFound();
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) notFound();

  return (
    <div className="space-y-6">
      <PageHeader title={`${customer.name} 様 を編集`} />
      <CustomerForm customer={customer} />
      <form action={deleteCustomer.bind(null, customer.id)} className="text-right">
        <ConfirmSubmitButton message={`${customer.name} 様を削除します。よろしいですか？`}>この顧客を削除</ConfirmSubmitButton>
      </form>
    </div>
  );
}
