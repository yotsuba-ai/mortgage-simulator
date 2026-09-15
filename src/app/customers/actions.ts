"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { customerSchema, formDataToObject, toFieldErrors, type FormState } from "@/lib/validation";

export async function saveCustomer(id: number | null, _prev: FormState, formData: FormData): Promise<FormState> {
  const values = formDataToObject(formData);
  const parsed = customerSchema.safeParse(values);
  if (!parsed.success) {
    return { errors: toFieldErrors(parsed.error), values };
  }
  const data = parsed.data;
  let savedId: number;
  if (id == null) {
    const created = await prisma.customer.create({ data });
    savedId = created.id;
  } else {
    await prisma.customer.update({ where: { id }, data });
    savedId = id;
  }
  revalidatePath("/");
  revalidatePath("/customers");
  revalidatePath(`/customers/${savedId}`);
  redirect(`/customers/${savedId}`);
}

export async function deleteCustomer(id: number): Promise<void> {
  await prisma.customer.delete({ where: { id } });
  revalidatePath("/");
  revalidatePath("/customers");
  redirect("/customers");
}
