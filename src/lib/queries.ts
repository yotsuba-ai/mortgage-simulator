import type { Customer, Property } from "@prisma/client";
import { prisma } from "./db";
import { compareMatch, matchCustomerProperty, type MatchResult } from "./matching";
import { parseAreas, type CustomerConditions, type PropertyInfo } from "./types";

export function toConditions(c: Customer): CustomerConditions {
  return {
    id: c.id,
    name: c.name,
    budgetMin: c.budgetMin,
    budgetMax: c.budgetMax,
    preferredAreas: parseAreas(c.preferredAreas),
    propertyType: c.propertyType,
    minBedrooms: c.minBedrooms,
    parkingSpaces: c.parkingSpaces,
    maxBuildingAge: c.maxBuildingAge,
    schoolDistrict: c.schoolDistrict,
  };
}

export function toPropertyInfo(p: Property): PropertyInfo {
  return {
    id: p.id,
    name: p.name,
    price: p.price,
    address: p.address,
    area: p.area,
    propertyType: p.propertyType,
    bedrooms: p.bedrooms,
    parkingSpaces: p.parkingSpaces,
    buildingAge: p.buildingAge,
    schoolDistrict: p.schoolDistrict,
  };
}

export interface RankedCustomer {
  customer: Customer;
  match: MatchResult;
}

export interface RankedProperty {
  property: Property;
  match: MatchResult;
}

/** 物件に対して提案すべき顧客をスコア順に返す */
export async function rankCustomersForProperty(property: Property): Promise<RankedCustomer[]> {
  const customers = await prisma.customer.findMany({ orderBy: { updatedAt: "desc" } });
  const info = toPropertyInfo(property);
  return customers
    .map((customer) => ({ customer, match: matchCustomerProperty(toConditions(customer), info) }))
    .sort((a, b) => compareMatch(a.match, b.match) || a.customer.priority.localeCompare(b.customer.priority));
}

/** 顧客に対しておすすめ物件をスコア順に返す */
export async function rankPropertiesForCustomer(customer: Customer, limit?: number): Promise<RankedProperty[]> {
  const properties = await prisma.property.findMany({ orderBy: { createdAt: "desc" } });
  const cond = toConditions(customer);
  const ranked = properties
    .map((property) => ({ property, match: matchCustomerProperty(cond, toPropertyInfo(property)) }))
    .sort((a, b) => compareMatch(a.match, b.match));
  return limit ? ranked.slice(0, limit) : ranked;
}
