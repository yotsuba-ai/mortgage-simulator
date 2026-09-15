import { PropertyForm } from "@/components/PropertyForm";
import { PageHeader } from "@/components/PageHeader";

export default function NewPropertyPage() {
  return (
    <div>
      <PageHeader title="物件を追加" />
      <PropertyForm />
    </div>
  );
}
