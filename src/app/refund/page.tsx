import { LegalDocument, LegalSection } from '@/components/LegalDocument';
import { COMPANY } from '@/lib/company';

export default function RefundPage() {
  return (
    <LegalDocument kicker="Legal" title="취소 및 환불 / 분쟁 해결 규정" updated="2026년 10월 16일">
      <LegalSection title="제1조 (목적)">
        <p>
          이 규정은 {COMPANY.brand}에서 광고주가 결제한 스폰서십 대금의 취소·환불과
          크리에이터 과업 불이행에 대한 분쟁 처리 기준을 정합니다. 결제는 토스페이먼츠를
          통해 이루어지며, 환불은 결제 수단의 정책과 관련 법령을 따릅니다.
        </p>
      </LegalSection>
      <LegalSection title="제2조 (청약철회 및 결제 취소)">
        <p>
          낙찰·결제가 완료되기 전(결제 창 이탈, 승인 실패)에는 거래가 성립하지 않으며 별도
          환불이 발생하지 않습니다. 결제 승인 후 크리에이터가 과업을 시작하지 않았고 광고주가
          취소를 요청한 경우, 회사는 영업일 기준 신속히 전액 취소·환불을 진행할 수 있습니다.
        </p>
      </LegalSection>
      <LegalSection title="제3조 (광고 미이행 시 100% 환불)">
        <p>
          크리에이터가 합의된 기한 내에 과업을 이행하지 않거나, 캠페인 필수 조건을 중대하게
          위반하여 광고 목적을 달성할 수 없음이 확인되면, 광고주는 결제 대금의 100% 환불을
          요청할 수 있습니다. 회사는 증빙(메시지, 미게시 캡처 등)을 검토한 뒤 승인 시 광고주
          결제액을 전액 환불하고 해당 크리에이터 정산을 지급하지 않습니다.
        </p>
      </LegalSection>
      <LegalSection title="제4조 (부분 환불)">
        <p>
          과업이 일부만 이행되었거나 수정 요청이 합리적인 범위에서 거부된 경우, 회사는 양
          당사자 합의 또는 객관적 이행률에 따라 부분 환불을 조정할 수 있습니다. 이미 광고주가
          최종 검수를 승인한 건은 원칙적으로 환불 대상이 아닙니다.
        </p>
      </LegalSection>
      <LegalSection title="제5조 (크리에이터 제재)">
        <p>
          다음 사유가 확인되면 회사는 경고, 정산 보류, 계정 정지, 서비스 이용 제한을 할 수
          있습니다.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>낙찰 후 정당한 사유 없이 과업을 거부·방치하는 행위</li>
          <li>허위 채널 정보, 대행 사칭, 중복 계정으로 입찰하는 행위</li>
          <li>광고 미이행으로 100% 환불이 반복되는 경우</li>
          <li>법령 위반 콘텐츠 게시 또는 광고주 자료의 무단 유출</li>
        </ul>
      </LegalSection>
      <LegalSection title="제6조 (분쟁 해결 절차)">
        <p>
          당사자는 먼저 플랫폼 내 메시지·고객센터({COMPANY.email})로 이의를 제기합니다. 회사는
          접수일로부터 영업일 7일 이내에 사실관계를 확인하고 환불·제재·기각 여부를 통지합니다.
          협의가 어려운 경우 전자문서 및 전자거래 기본법, 전자상거래법 등 관련 법령과
          대한상사중재원 등 분쟁조정 절차를 안내할 수 있습니다.
        </p>
      </LegalSection>
      <LegalSection title="제7조 (환불 처리 기간)">
        <p>
          승인된 환불은 결제사 정책에 따라 카드는 통상 3~7 영업일, 계좌이체·간편결제는 해당
          수단의 처리 기간 내에 반영됩니다. 실제 입금·취소 완료 시점은 카드사·은행에 따릅니다.
        </p>
      </LegalSection>
    </LegalDocument>
  );
}
