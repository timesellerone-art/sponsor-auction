import { LegalDocument, LegalSection } from '@/components/LegalDocument';
import { COMPANY, COMPANY_OPERATOR_LINE } from '@/lib/company';

export default function RefundPage() {
  return (
    <LegalDocument kicker="Legal" title="환불 및 취소 규정" updated="2026년 11월 19일">
      <LegalSection title="운영 주체">
        <p>
          본 규정의 운영 주체는 {COMPANY_OPERATOR_LINE}입니다. 사업장 소재지는{' '}
          {COMPANY.address}입니다. 결제는 토스페이먼츠를 통해 이루어지며, 환불은 결제 수단의
          정책과 관련 법령을 따릅니다.
        </p>
      </LegalSection>
      <LegalSection title="제1조 (목적)">
        <p>
          이 규정은 {COMPANY.brand}에서 광고주가 결제한 스폰서십 대금 및 PG 검수 목적의
          테스트 결제의 취소·환불과 크리에이터 과업 불이행에 대한 분쟁 처리 기준을 정합니다.
        </p>
      </LegalSection>
      <LegalSection title="제2조 (용역 제공 개시 전 100% 전액 환불)">
        <p>
          디지털/용역 서비스 제공 개시 전(매칭 확정 및 작업 시작 전)에는 광고주 또는 결제자가
          취소를 요청하면 결제 금액을 100% 전액 환불합니다. 결제 창 이탈·승인 실패로 거래가
          성립하지 않은 경우에는 별도 환불이 발생하지 않습니다.
        </p>
      </LegalSection>
      <LegalSection title="제3조 (용역 제공 개시 후 부분 환불 또는 환불 불가)">
        <p>
          용역 제공 개시 후(제작 진행 중)에는 진행률 및 상호 합의된 정산 기준에 따라 부분
          환불하거나, 이미 제공된 용역에 상응하는 금액은 환불하지 않을 수 있습니다. 광고주가
          최종 검수를 승인한 건은 원칙적으로 환불 대상이 아닙니다.
        </p>
      </LegalSection>
      <LegalSection title="제4조 (광고 미이행 시 100% 환불)">
        <p>
          크리에이터가 합의된 기한 내에 과업을 이행하지 않거나, 캠페인 필수 조건을 중대하게
          위반하여 광고 목적을 달성할 수 없음이 확인되면, 광고주는 결제 대금의 100% 환불을
          요청할 수 있습니다. 회사는 증빙(메시지, 미게시 캡처 등)을 검토한 뒤 승인 시 광고주
          결제액을 전액 환불하고 해당 크리에이터 정산을 지급하지 않습니다.
        </p>
      </LegalSection>
      <LegalSection title="제5조 (부분 환불)">
        <p>
          과업이 일부만 이행되었거나 수정 요청이 합리적인 범위에서 거부된 경우, 회사는 양
          당사자 합의 또는 객관적 이행률에 따라 부분 환불을 조정할 수 있습니다.
        </p>
      </LegalSection>
      <LegalSection title="제6조 (크리에이터 제재)">
        <p>
          다음 사유가 확인되면 회사는 경고, 정산 보류, 계정 정지, 서비스 이용 제한을 할 수
          있습니다.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>낙찰 후 정당한 사유 없이 과업을 거부·방치하는 행위</li>
          <li>허위 채널 정보, 대행 사칭, 중복 계정으로 제안하는 행위</li>
          <li>광고 미이행으로 100% 환불이 반복되는 경우</li>
          <li>법령 위반 콘텐츠 게시 또는 광고주 자료의 무단 유출</li>
        </ul>
      </LegalSection>
      <LegalSection title="제7조 (분쟁 해결 절차)">
        <p>
          당사자는 먼저 플랫폼 내 메시지·고객센터({COMPANY.email}, {COMPANY.phone})로 이의를
          제기합니다. 회사는 접수일로부터 영업일 7일 이내에 사실관계를 확인하고
          환불·제재·기각 여부를 통지합니다. 협의가 어려운 경우 전자상거래법 등 관련 법령과
          대한상사중재원 등 분쟁조정 절차를 안내할 수 있습니다.
        </p>
      </LegalSection>
      <LegalSection title="제8조 (환불 처리 기간)">
        <p>
          환불 승인일로부터 영업일 기준 3~5일 이내에 결제 수단 원복 처리를 진행합니다. 카드는
          카드사 정책에 따라 반영 시점이 달라질 수 있으며, 계좌이체·간편결제는 해당 수단의
          처리 기간을 따릅니다.
        </p>
      </LegalSection>
    </LegalDocument>
  );
}
