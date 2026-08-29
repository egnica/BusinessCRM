import { ObjectId } from "mongodb";
import clientPromise from "@/lib/mongodb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function buildContact(prospect, now) {
  const confirmedProperties =
    prospect.metroLookup?.confirmedProperties?.length
      ? prospect.metroLookup.confirmedProperties
      : prospect.properties || [];
  const primaryProperty =
    prospect.primaryProperty ||
    confirmedProperties.find(
      (property) => property.parcelId === prospect.primaryParcelId,
    ) ||
    confirmedProperties[0] ||
    null;

  return {
    firstName: "",
    lastName: "",
    ownerNameRaw: prospect.ownerNameRaw || "",
    ownerType: prospect.ownerType || "individual",
    coOwnerName: prospect.coOwnerName || "",
    project: "property-owner-outreach",
    jobTitle: "",
    email: "",
    phone: "",
    company: {
      name: prospect.ownerType === "llc" ? prospect.ownerNameRaw || "" : "",
      website: "",
      industry: "",
    },
    address: {
      street1: "",
      street2: "",
      city: "",
      state: "",
      zip: "",
      country: "US",
    },
    property: primaryProperty,
    properties: confirmedProperties,
    propertyOutreachKey: prospect.propertyOutreachKey,
    propertySearchCity: prospect.searchCity || "",
    propertyCityCount:
      prospect.cityPropertyCount || prospect.propertyCount || 0,
    propertyMetroConfirmedCount:
      prospect.metroLookup?.confirmedPropertyCount || null,
    propertyOutreachAliases: prospect.propertyOutreachAliases || [],
    propertyProspectId: prospect._id.toString(),
    propertyMailingAddressRaw: prospect.mailingAddress || null,
    rank: "",
    relationshipType: "Property Owner Prospect",
    facebook: "",
    linkedin: "",
    website: "",
    serviceInterest: [],
    birthday: null,
    notes: prospect.notes
      ? `Promoted from Property Owner Outreach.\n\n${prospect.notes}`
      : "Promoted from Property Owner Outreach.",
    emailStatus: "unknown",
    introEmail: {
      sent: false,
      sentAt: null,
    },
    lastContact: {
      date: null,
      type: "",
      notes: "",
    },
    nextFollowUp: null,
    createdAt: now,
    updatedAt: now,
  };
}

export async function POST(_request, { params }) {
  try {
    const { id } = await params;

    if (!ObjectId.isValid(id)) {
      return Response.json({ error: "Invalid prospect ID" }, { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db("crm");
    const prospects = db.collection("propertyProspects");
    const contacts = db.collection("contacts");

    const prospect = await prospects.findOne({
      _id: new ObjectId(id),
    });

    if (!prospect) {
      return Response.json({ error: "Prospect not found" }, { status: 404 });
    }

    const linkedProperties =
      prospect.metroLookup?.confirmedProperties?.length
        ? prospect.metroLookup.confirmedProperties
        : prospect.properties || [];
    const parcelKeys = linkedProperties
      .map(
        (property) =>
          property.parcelKey ||
          (property.county && property.parcelId
            ? `${property.county}:${property.parcelId}`
            : ""),
      )
      .filter(Boolean);
    const parcelIds = linkedProperties
      .map((property) => property.parcelId)
      .filter(Boolean);

    const existingContact = await contacts.findOne({
      $or: [
        { propertyOutreachKey: prospect.propertyOutreachKey },
        { propertyOutreachAliases: prospect.propertyOutreachKey },
        ...(parcelKeys.length
          ? [{ "properties.parcelKey": { $in: parcelKeys } }]
          : []),
        ...(parcelIds.length
          ? [{ "properties.parcelId": { $in: parcelIds } }]
          : []),
      ],
    });

    const now = new Date().toISOString();

    if (existingContact) {
      await prospects.updateOne(
        { _id: prospect._id },
        {
          $set: {
            crmContactId: existingContact._id,
            promotedAt: prospect.promotedAt || now,
            updatedAt: now,
          },
        },
      );

      return Response.json({
        message: "Prospect is already linked to a CRM contact.",
        contactId: existingContact._id.toString(),
        alreadyExists: true,
      });
    }

    const result = await contacts.insertOne(buildContact(prospect, now));

    await prospects.updateOne(
      { _id: prospect._id },
      {
        $set: {
          crmContactId: result.insertedId,
          promotedAt: now,
          updatedAt: now,
        },
      },
    );

    return Response.json(
      {
        message: "Prospect added to the main CRM.",
        contactId: result.insertedId.toString(),
        alreadyExists: false,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Property prospect promotion error:", error);

    return Response.json(
      { error: "Failed to add prospect to the CRM" },
      { status: 500 },
    );
  }
}
