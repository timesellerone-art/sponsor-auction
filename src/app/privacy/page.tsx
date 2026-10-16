import { LegalDocument, LegalSection } from '@/components/LegalDocument';
import { COMPANY } from '@/lib/company';

export default function PrivacyPage() {
  return (
    <LegalDocument kicker="Legal" title="개인정보 처리방침" updated="2026년 10월 16일">
      <LegalSection title="1. 개인정보 처리 목적">
        <p>
          {COMPANY.legalName}(이하 &quot;회사&quot;)는 회원가입, 역경매 매칭, 낙찰·결제, 정산,
          고객 지원 및 법령상 의무 이행을 위해 개인정보를 처리합니다. 동의 없는 마케팅 목적
          이용은 하지 않습니다.
        </p>
      </LegalSection>
      <LegalSection title="2. 수집하는 개인정보 항목">
        <ul className="list-disc space-y-1 pl-5">
          <li>필수: 이름, 이메일, 비밀번호(또는 소셜 로그인 식별자), 회원 역할</li>
          <li>서비스 이용: 캠페인·제안 내용, 채널 URL, 입찰 금액, 접속 로그·기기 정보</li>
          <li>결제: 주문번호, 결제금액, 결제수단 유형, 승인 시각(카드번호 등 민감 정보는 결제사가 처리)</li>
          <li>정산: 크리에이터 이름·이메일, 계좌 정보(운영자가 수집하는 경우)</li>
        </ul>
      </LegalSection>
      <LegalSection title="3. 보유 및 이용 기간">
        <p>
          회원 탈퇴 시 지체 없이 파기합니다. 다만 「전자상거래 등에서의 소비자보호에 관한
          법률」 등 관계 법령에 따라 아래 기간 보관할 수 있습니다.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>계약 또는 청약철회 기록: 5년</li>
          <li>대금결제 및 재화 등의 공급 기록: 5년</li>
          <li>소비자 불만 또는 분쟁 처리 기록: 3년</li>
          <li>접속 로그 등 통신사실확인자료: 3개월 이상(관련 법령이 정하는 기간)</li>
        </ul>
      </LegalSection>
      <LegalSection title="4. 제3자 제공 및 처리위탁 (동의)">
        <p>
          회사는 결제 승인·취소·환불을 위해 토스페이먼츠(전자지급결제대행)에 주문번호, 결제금액,
          구매자 식별에 필요한 최소 정보를 제공합니다. 회원가입·인증 인프라는 Supabase 등
          수탁사에 위탁할 수 있으며, 호스팅은 {COMPANY.hosting}를 이용합니다.
        </p>
        <p>
          회원은 회원가입 시 본 처리방침에 동의함으로써 위 제3자 제공 및 처리위탁에 동의한
          것으로 봅니다. 법령에 따른 경우를 제외하고 동의 없이 제3자에게 제공하지 않습니다.
        </p>
      </LegalSection>
      <LegalSection title="5. 이용자의 권리">
        <p>
          회원은 개인정보 열람·정정·삭제·처리정지·동의 철회를 요청할 수 있습니다. 문의는{' '}
          {COMPANY.email} 또는 서비스 내 고객 지원 채널을 이용해 주세요. 결제 기록이 법령상
          보관 대상인 경우 삭제 요청이 제한될 수 있습니다.
        </p>
      </LegalSection>
      <LegalSection title="6. 안전성 확보조치">
        <p>
          접근 권한 제한, 전송 구간 암호화, 결제 승인 시 주문 금액 검증, 관리자 권한 분리 등
          기술적·관리적 보호조치를 시행합니다.
        </p>
      </LegalSection>
      <LegalSection title="7. 개인정보 보호책임자">
        <p>
          성명: {COMPANY.ceo} · 이메일: {COMPANY.email}
        </p>
      </LegalSection>
    </LegalDocument>
  );
}
