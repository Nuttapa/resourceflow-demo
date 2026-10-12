'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { RequestForm } from '@/components/domain/RequestForm';
import { ROLE_LABEL } from '@/lib/types';
import { useDemoState } from '@/state/DemoStateProvider';

export default function CreateRequestPage() {
  const router = useRouter();
  const { activeUser } = useDemoState();

  return (
    <>
      <PageHeader
        title="Create Request"
        description="File a new request against the simulated resource pools. Nothing here reaches a real system."
        action={
          <Link href="/requests/" className="rounded-lg border border-line px-4 py-2 text-sm font-medium">
            Back to requests
          </Link>
        }
      />

      <Card className="max-w-3xl">
        <CardHeader
          title="New resource request"
          description={`Filed as ${activeUser.name} — ${ROLE_LABEL[activeUser.role]}. Switch persona in the header to file as someone else.`}
        />
        <CardBody>
          <RequestForm
            onCreated={(requestId) => router.push(`/requests/detail/?id=${encodeURIComponent(requestId)}`)}
          />
        </CardBody>
      </Card>
    </>
  );
}
