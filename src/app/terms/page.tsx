import { LegalDocument, LegalSection } from '@/components/LegalDocument';

export default function TermsPage() {
  return (
    <LegalDocument kicker="Legal" title="서비스 이용약관" updated="2026년 10월 13일">
      <LegalSection title="제1조 (목적)">
        <p>
          이 약관은 SponsorAuction(이하 &quot;회사&quot;)이 제공하는 마이크로 스폰서십 역경매
          서비스의 이용 조건과 회사·광고주·크리에이터의 권리·의무를 정합니다.
        </p>
      </LegalSection>
      <LegalSection title="제2조 (정의)">
        <p>
          &quot;광고주&quot;는 캠페인(역경매)을 등록하는 회원, &quot;크리에이터&quot;는 제안에
          입찰하는 회원, &quot;낙찰&quot;은 광고주가 제안을 선택하고 결제를 완료한 상태를
          말합니다.
        </p>
      </LegalSection>
      <LegalSection title="제3조 (약관의 효력)">
        <p>
          회원은 회원가입 및 제안 제출 시 이 약관에 동의한 것으로 보며, 회사는 관련 법령에
          따라 약관을 변경할 수 있습니다. 변경 시 서비스 내 공지합니다.
        </p>
      </LegalSection>
      <LegalSection title="제4조 (서비스 내용)">
        <p>
          회사는 캠페인 등록, 제안 접수, 낙찰·매칭, 안전결제 중개 및 정산 정보를 제공합니다.
          콘텐츠 제작·게시 자체는 광고주와 크리에이터 사이의 계약 이행입니다.
        </p>
      </LegalSection>
      <LegalSection title="제5조 (수수료 및 결제)">
        <p>
          낙찰 시 광고주는 제안 금액에 안전결제 수수료(10%)를 더한 금액을 결제합니다.
          크리에이터 정산액은 제안 금액에서 플랫폼 수수료(15%)를 제외한 금액입니다. 결제가
          승인되기 전에는 낙찰이 확정되지 않습니다.
        </p>
      </LegalSection>
      <LegalSection title="제6조 (회원의 의무)">
        <p>
          회원은 허위 정보, 타인의 권리 침해, 법령 위반 캠페인·제안을 등록해서는 안 됩니다.
          회사는 운영정책에 따라 게시물을 블라인드하거나 이용을 제한할 수 있습니다.
        </p>
      </LegalSection>
      <LegalSection title="제7조 (면책)">
        <p>
          천재지변, 통신 장애, 회원 간 콘텐츠 분쟁 등 회사의 합리적 관리 범위를 넘는 사유로
          발생한 손해에 대해 회사는 법령이 허용하는 범위에서 책임을 제한합니다.
        </p>
      </LegalSection>
      <LegalSection title="제8조 (준거법)">
        <p>이 약관은 대한민국 법령을 따르며, 분쟁은 민사소송법상의 관할 법원에 제소합니다.</p>
      </LegalSection>
    </LegalDocument>
  );
}
