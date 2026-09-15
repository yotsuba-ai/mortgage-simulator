import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { PropertyForm } from "@/components/PropertyForm";
import { PageHeader } from "@/components/PageHeader";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import { deleteProperty } from "../../actions";

export const dynamic = "force-dynamic";

export default async function EditPropertyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const propertyId = Number(id);
  if (!Number.isInteger(propertyId)) notFound();
  const property = await prisma.property.findUnique({ where: { id: propertyId } });
  if (!property) notFound();

  return (
    <div className="space-y-6">
      <PageHeader title={`${property.name} を編集`} />
      <PropertyForm property={property} />
      <form action={deleteProperty.bind(null, property.id)} className="text-right">
        <ConfirmSubmitButton message={`「${property.name}」を削除します。よろしいですか？`}>この物件を削除</ConfirmSubmitButton>
      </form>
    </div>
  );
}
